import { STORAGE_KEYS } from "@/lib/constants";
import { isValidStellarPublicKey } from "@/lib/security";
import { readLocalStorage, writeLocalStorage } from "@/lib/storage";

export type WalletProviderId =
  | "freighter"
  | "xbull"
  | "albedo"
  | "rabet"
  | "lobstr"
  | "hana"
  | "klever"
  | "wallet_connect"
  | "manual";

export type ConnectableWalletProviderId = Exclude<WalletProviderId, "manual">;

export interface StoredWallet {
  address: string;
  provider: WalletProviderId;
}

export interface WalletLoginSignature {
  provider: ConnectableWalletProviderId;
  signerAddress: string;
  signedMessage: string;
  originalMessage?: string;
  messageSignature?: string;
}

interface WalletMap {
  [userId: string]: StoredWallet;
}

type WalletKitRuntime = {
  StellarWalletsKit: typeof import("@creit.tech/stellar-wallets-kit").StellarWalletsKit;
  Networks: typeof import("@creit.tech/stellar-wallets-kit").Networks;
  moduleIdByProvider: Partial<Record<ConnectableWalletProviderId, string>>;
};

const CONNECTABLE_PROVIDERS: ConnectableWalletProviderId[] = [
  "freighter",
  "xbull",
  "albedo",
  "rabet",
  "lobstr",
  "hana",
  "klever",
  "wallet_connect",
];

export const WALLET_OPTIONS: Array<{ id: ConnectableWalletProviderId; label: string }> = [
  { id: "freighter", label: "Freighter" },
  { id: "xbull", label: "xBull" },
  { id: "albedo", label: "Albedo" },
  { id: "rabet", label: "Rabet" },
  { id: "lobstr", label: "LOBSTR" },
  { id: "hana", label: "Hana" },
  { id: "klever", label: "Klever" },
  { id: "wallet_connect", label: "WalletConnect" },
];

export const WALLET_CONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ?? "";
export const WALLET_CONNECT_CONFIGURED = WALLET_CONNECT_PROJECT_ID.length > 0;
const WALLET_CONNECT_CHAIN = (process.env.NEXT_PUBLIC_WALLETCONNECT_CHAIN?.trim().toLowerCase() ?? "testnet") === "public"
  ? "public"
  : "testnet";
export const AVAILABLE_WALLET_OPTIONS = WALLET_OPTIONS.filter((option) => (
  option.id !== "wallet_connect" || WALLET_CONNECT_CONFIGURED
));

const providerLabelMap: Record<WalletProviderId, string> = {
  freighter: "Freighter",
  xbull: "xBull",
  albedo: "Albedo",
  rabet: "Rabet",
  lobstr: "LOBSTR",
  hana: "Hana",
  klever: "Klever",
  wallet_connect: "WalletConnect",
  manual: "Movil/Manual",
};

let walletKitRuntimePromise: Promise<WalletKitRuntime> | null = null;
let walletConnectRejectionGuardInstalled = false;
let walletConnectConsoleNoiseGuardInstalled = false;
const WALLET_CONNECT_BOOT_TIMEOUT_MS = 20_000;
const WALLET_CONNECT_ADDRESS_TIMEOUT_MS = 60_000;
const WALLET_CONNECT_ATTEMPTS = 5;

function isWalletProviderId(value: unknown): value is WalletProviderId {
  return typeof value === "string" && (providerLabelMap as Record<string, string>)[value] !== undefined;
}

function normalizeAddress(raw: string) {
  return raw.trim().toUpperCase();
}

function normalizeProvider(value: string): ConnectableWalletProviderId | null {
  const normalized = value.trim().toLowerCase();
  return CONNECTABLE_PROVIDERS.find((provider) => provider === normalized) ?? null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const nestedError = record.error;
    if (nestedError && nestedError !== error) {
      const nestedMessage = getErrorMessage(nestedError, "");
      if (nestedMessage) return nestedMessage;
    }
    const reason = record.reason;
    if (reason && reason !== error) {
      const reasonMessage = getErrorMessage(reason, "");
      if (reasonMessage) return reasonMessage;
    }
    const code = typeof record.code === "number" || typeof record.code === "string"
      ? String(record.code)
      : "";
    const message = typeof record.message === "string" ? record.message.trim() : "";
    if (message && code) return `${message} (code: ${code})`;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function shouldRetryWalletConnect(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("failed to publish custom payload")
    || normalized.includes("network request failed")
    || normalized.includes("timeout")
    || normalized.includes("relay")
    || normalized.includes("excedio el tiempo de espera")
    || normalized.includes("no respondio")
    || normalized.includes("inicializar el cliente");
}

function clearWalletConnectStorage() {
  if (typeof window === "undefined") return;
  try {
    const keysToDelete: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      const normalized = key.toLowerCase();
      if (normalized.includes("walletconnect") || normalized.startsWith("wc@")) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage cleanup failures.
  }
}

function getWalletConnectAllowedChains(walletConnect: typeof import("@creit.tech/stellar-wallets-kit/modules/wallet-connect")) {
  if (WALLET_CONNECT_CHAIN === "public") {
    return [walletConnect.WalletConnectTargetChain.PUBLIC];
  }
  return [walletConnect.WalletConnectTargetChain.TESTNET];
}

function installWalletConnectRejectionGuard() {
  if (walletConnectRejectionGuardInstalled || typeof window === "undefined") return;
  walletConnectRejectionGuardInstalled = true;

  window.addEventListener("unhandledrejection", (event) => {
    const message = getErrorMessage(event.reason, "").toLowerCase();
    const reasonIsEmptyObject = Boolean(event.reason)
      && typeof event.reason === "object"
      && Object.keys(event.reason as Record<string, unknown>).length === 0;

    const isWalletConnectRelayNoise = message.includes("walletconnect")
      || message.includes("reown")
      || message.includes("failed to publish custom payload")
      || message.includes("relay");

    if (reasonIsEmptyObject || isWalletConnectRelayNoise) {
      event.preventDefault();
    }
  });
}

function isWalletConnectConsoleNoise(args: unknown[]) {
  const text = args
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      try {
        return JSON.stringify(item);
      } catch {
        return "";
      }
    })
    .join(" ")
    .toLowerCase();

  if (!text) return false;

  const hasWalletConnectHint = text.includes("walletconnect")
    || text.includes("reown")
    || text.includes("wc_")
    || text.includes("wc:");

  const isKnownNoise = text.includes("proposal expired")
    || text.includes("deleteproposal")
    || text.includes("no matching key")
    || text.includes("failed to fetch")
    || text.includes("checkexpirations")
    || text.includes("appendtologs")
    || text.includes("forwardtoconsole");

  return hasWalletConnectHint && isKnownNoise;
}

function installWalletConnectConsoleNoiseGuard() {
  if (walletConnectConsoleNoiseGuardInstalled || typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "development") return;
  walletConnectConsoleNoiseGuardInstalled = true;

  const originalConsoleError = window.console.error.bind(window.console);
  window.console.error = (...args: unknown[]) => {
    if (isWalletConnectConsoleNoise(args)) return;
    originalConsoleError(...args);
  };
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function parseWalletSignPayload(rawSignedMessage: string) {
  const trimmed = rawSignedMessage.trim();
  if (!trimmed) {
    return {
      signedMessage: "",
      originalMessage: undefined,
      messageSignature: undefined,
    };
  }

  if (!(trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    return {
      signedMessage: trimmed,
      originalMessage: undefined,
      messageSignature: undefined,
    };
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return {
      signedMessage: pickString(parsed, ["signedMessage", "signed_message", "signed"]) || trimmed,
      originalMessage: pickString(parsed, ["originalMessage", "original_message"]) || undefined,
      messageSignature: pickString(parsed, ["messageSignature", "message_signature", "signature"]) || undefined,
    };
  } catch {
    return {
      signedMessage: trimmed,
      originalMessage: undefined,
      messageSignature: undefined,
    };
  }
}

function resolveKitNetwork(
  Networks: typeof import("@creit.tech/stellar-wallets-kit").Networks,
  networkPassphrase?: string,
) {
  if (networkPassphrase === Networks.PUBLIC) return Networks.PUBLIC;
  return Networks.TESTNET;
}

async function resolveConnectedModuleNetwork(runtime: WalletKitRuntime) {
  const selectedModule = runtime.StellarWalletsKit.selectedModule as {
    getNetwork?: () => Promise<{ networkPassphrase?: string; network?: string }>;
  };

  if (!selectedModule?.getNetwork) {
    return runtime.Networks.TESTNET;
  }

  try {
    const networkResult = await withTimeout(
      selectedModule.getNetwork(),
      3_000,
      "No se pudo leer la red activa de la wallet.",
    );
    const networkPassphrase = typeof networkResult?.networkPassphrase === "string"
      ? networkResult.networkPassphrase
      : "";
    return resolveKitNetwork(runtime.Networks, networkPassphrase);
  } catch {
    return runtime.Networks.TESTNET;
  }
}

async function getWalletKitRuntime(): Promise<WalletKitRuntime> {
  if (typeof window === "undefined") {
    throw new Error("Wallets solo disponibles en navegador.");
  }
  if (walletKitRuntimePromise) return walletKitRuntimePromise;

  walletKitRuntimePromise = (async () => {
    const [{ StellarWalletsKit, Networks }, freighter, xbull, albedo, rabet, lobstr, hana, klever, walletConnect, appKitNetworks] = await Promise.all([
      import("@creit.tech/stellar-wallets-kit"),
      import("@creit.tech/stellar-wallets-kit/modules/freighter"),
      import("@creit.tech/stellar-wallets-kit/modules/xbull"),
      import("@creit.tech/stellar-wallets-kit/modules/albedo"),
      import("@creit.tech/stellar-wallets-kit/modules/rabet"),
      import("@creit.tech/stellar-wallets-kit/modules/lobstr"),
      import("@creit.tech/stellar-wallets-kit/modules/hana"),
      import("@creit.tech/stellar-wallets-kit/modules/klever"),
      import("@creit.tech/stellar-wallets-kit/modules/wallet-connect"),
      import("@reown/appkit/networks"),
    ]);

    const modules = [
      new freighter.FreighterModule(),
      new xbull.xBullModule(),
      new albedo.AlbedoModule(),
      new rabet.RabetModule(),
      new lobstr.LobstrModule(),
      new hana.HanaModule(),
      new klever.KleverModule(),
    ];

    const moduleIdByProvider: Partial<Record<ConnectableWalletProviderId, string>> = {
      freighter: freighter.FREIGHTER_ID,
      xbull: xbull.XBULL_ID,
      albedo: albedo.ALBEDO_ID,
      rabet: rabet.RABET_ID,
      lobstr: lobstr.LOBSTR_ID,
      hana: hana.HANA_ID,
      klever: klever.KLEVER_ID,
    };

    if (WALLET_CONNECT_CONFIGURED) {
      installWalletConnectRejectionGuard();
      installWalletConnectConsoleNoiseGuard();
      modules.push(
        new walletConnect.WalletConnectModule({
          projectId: WALLET_CONNECT_PROJECT_ID,
          metadata: {
            name: "Terra Capital",
            description: "Terra Capital wallet bridge",
            url: window.location.origin,
            icons: ["https://assets.reown.com/reown-profile-pic.png"],
          },
          allowedChains: getWalletConnectAllowedChains(walletConnect),
          appKitOptions: {
            projectId: WALLET_CONNECT_PROJECT_ID,
            networks: [appKitNetworks.mainnet],
            manualWCControl: false,
          },
          signClientOptions: {
            relayUrl: "wss://relay.walletconnect.org",
            logger: "silent",
            telemetryEnabled: false,
          },
        }),
      );
      moduleIdByProvider.wallet_connect = walletConnect.WALLET_CONNECT_ID;
    }

    StellarWalletsKit.init({
      modules,
      network: Networks.TESTNET,
    });

    return { StellarWalletsKit, Networks, moduleIdByProvider };
  })().catch((error) => {
    walletKitRuntimePromise = null;
    throw new Error(getErrorMessage(error, "No se pudo inicializar el kit de wallets."));
  });

  return walletKitRuntimePromise;
}

async function getWalletModuleId(provider: ConnectableWalletProviderId) {
  const runtime = await getWalletKitRuntime();
  const moduleId = runtime.moduleIdByProvider[provider];
  if (moduleId) {
    return { ok: true as const, runtime, moduleId };
  }
  if (provider === "wallet_connect") {
    return {
      ok: false as const,
      message: "WalletConnect no esta configurado. Define NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID y reinicia la app.",
    };
  }
  return {
    ok: false as const,
    message: `El proveedor ${provider} no esta disponible en este entorno.`,
  };
}

async function getAddressFromActiveModule(runtime: WalletKitRuntime, provider: ConnectableWalletProviderId) {
  try {
    const selectedModule = runtime.StellarWalletsKit.selectedModule as {
      isAvailable?: () => Promise<boolean>;
      getAddress?: () => Promise<{ address?: string }>;
    };

    // WalletConnect starts its sign client asynchronously; wait briefly so first connect attempt does not fail.
    if (provider === "wallet_connect" && selectedModule?.isAvailable) {
      let ready = false;
      const startedAt = Date.now();
      while (Date.now() - startedAt < WALLET_CONNECT_BOOT_TIMEOUT_MS) {
        if (await selectedModule.isAvailable()) {
          ready = true;
          break;
        }
        await sleep(200);
      }
      if (!ready) {
        throw new Error(
          "WalletConnect no pudo inicializar el cliente a tiempo. Verifica Project ID, allowlist del dominio y bloqueadores de red.",
        );
      }
    }

    if (provider !== "wallet_connect" && selectedModule?.isAvailable) {
      const isAvailable = await withTimeout(
        selectedModule.isAvailable(),
        3_000,
        `No se pudo verificar disponibilidad de ${getWalletProviderLabel(provider)}.`,
      );
      if (!isAvailable) {
        throw new Error(`${getWalletProviderLabel(provider)} no esta disponible en este navegador/dispositivo.`);
      }
    }

    if (selectedModule?.getAddress) {
      return withTimeout(
        selectedModule.getAddress(),
        provider === "wallet_connect" ? WALLET_CONNECT_ADDRESS_TIMEOUT_MS : 15_000,
        `La conexion con ${getWalletProviderLabel(provider)} excedio el tiempo de espera.`,
      );
    }

    return withTimeout(
      runtime.StellarWalletsKit.getAddress(),
      10_000,
      `La conexion con ${getWalletProviderLabel(provider)} no respondio.`,
    );
  } catch (error) {
    throw new Error(getErrorMessage(error, "No se pudo obtener direccion desde la wallet."));
  }
}

export function getWalletProviderLabel(provider: WalletProviderId) {
  return providerLabelMap[provider];
}

export function getWalletMap() {
  const raw = readLocalStorage<Record<string, string | StoredWallet>>(STORAGE_KEYS.wallets, {});
  const normalized: WalletMap = {};

  for (const [userId, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      const address = normalizeAddress(value);
      if (isValidStellarPublicKey(address)) {
        normalized[userId] = { address, provider: "freighter" };
      }
      continue;
    }

    if (!value) continue;
    const address = normalizeAddress(value.address);
    if (!isValidStellarPublicKey(address)) continue;
    normalized[userId] = {
      address,
      provider: isWalletProviderId(value.provider) ? value.provider : "manual",
    };
  }

  return normalized;
}

export function getPendingWallet() {
  const wallet = readLocalStorage<StoredWallet | null>(STORAGE_KEYS.pendingWallet, null);
  if (!wallet || !isValidStellarPublicKey(wallet.address)) return null;
  return wallet;
}

export function setPendingWallet(wallet: StoredWallet) {
  writeLocalStorage(STORAGE_KEYS.pendingWallet, wallet);
  if (wallet.provider !== "manual") {
    writeLocalStorage(STORAGE_KEYS.lastWalletProvider, wallet.provider);
  }
}

export function clearPendingWallet() {
  writeLocalStorage(STORAGE_KEYS.pendingWallet, null);
}

export function getLastUsedConnectableWalletProvider() {
  const provider = readLocalStorage<string>(STORAGE_KEYS.lastWalletProvider, "");
  return normalizeProvider(provider);
}

export function getUserWallet(userId: string) {
  const map = getWalletMap();
  return map[userId] ?? null;
}

export function setUserWallet(userId: string, wallet: StoredWallet) {
  const map = getWalletMap();
  map[userId] = wallet;
  writeLocalStorage(STORAGE_KEYS.wallets, map);
  setPendingWallet(wallet);
}

export function removeUserWallet(userId: string) {
  const map = getWalletMap();
  delete map[userId];
  writeLocalStorage(STORAGE_KEYS.wallets, map);
}

export async function connectWalletByProvider(provider: ConnectableWalletProviderId) {
  try {
    const moduleRef = await getWalletModuleId(provider);
    if (!moduleRef.ok) {
      return { ok: false as const, message: moduleRef.message };
    }

    moduleRef.runtime.StellarWalletsKit.setWallet(moduleRef.moduleId);
    const response = await getAddressFromActiveModule(moduleRef.runtime, provider);
    const rawAddress = typeof response.address === "string" ? response.address : "";
    const address = normalizeAddress(rawAddress);
    if (!isValidStellarPublicKey(address)) {
      return { ok: false as const, message: "La wallet devolvio una direccion Stellar invalida." };
    }
    return {
      ok: true as const,
      wallet: {
        address,
        provider,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      message: getErrorMessage(error, `No se pudo conectar ${getWalletProviderLabel(provider)}.`),
    };
  }
}

export async function connectWalletConnect() {
  let lastMessage = "No se pudo conectar WalletConnect.";
  for (let attempt = 0; attempt < WALLET_CONNECT_ATTEMPTS; attempt += 1) {
    const result = await connectWalletByProvider("wallet_connect");
    if (result.ok) return result;
    lastMessage = result.message || lastMessage;

    if (!shouldRetryWalletConnect(lastMessage) || attempt === WALLET_CONNECT_ATTEMPTS - 1) {
      break;
    }

    // Recreate the runtime so WalletConnect can reinitialize its relay/sign client.
    walletKitRuntimePromise = null;
    clearWalletConnectStorage();
    await sleep(900 + (attempt * 400));
  }

  return {
    ok: false as const,
    message: `${lastMessage} Verifica internet estable y que tu dominio (ej: http://localhost:3000) este en allowlist de WalletConnect/Reown.`,
  };
}

export async function signWalletLoginChallenge(input: {
  wallet: StoredWallet;
  challengeMessage: string;
}) {
  const address = normalizeAddress(input.wallet.address);
  const message = input.challengeMessage.trim();
  const provider = normalizeProvider(input.wallet.provider);

  if (!provider) {
    return { ok: false as const, message: "Proveedor no soportado para login seguro." };
  }
  if (!isValidStellarPublicKey(address)) {
    return { ok: false as const, message: "Wallet invalida para firmar login." };
  }
  if (!message) {
    return { ok: false as const, message: "Challenge invalido para firma." };
  }

  const moduleRef = await getWalletModuleId(provider);
  if (!moduleRef.ok) {
    return { ok: false as const, message: moduleRef.message };
  }

  try {
    moduleRef.runtime.StellarWalletsKit.setWallet(moduleRef.moduleId);
    const runtimeNetwork = await resolveConnectedModuleNetwork(moduleRef.runtime);
    moduleRef.runtime.StellarWalletsKit.setNetwork(runtimeNetwork);
    const signed = await moduleRef.runtime.StellarWalletsKit.signMessage(message, {
      address,
      networkPassphrase: runtimeNetwork,
    });
    if (!signed.signedMessage) {
      return { ok: false as const, message: `No se pudo firmar el challenge en ${getWalletProviderLabel(provider)}.` };
    }
    const signedPayload = parseWalletSignPayload(signed.signedMessage);
    const untypedSigned = signed as {
      originalMessage?: unknown;
      messageSignature?: unknown;
      signature?: unknown;
    };
    const extraOriginalMessage = typeof untypedSigned.originalMessage === "string" ? untypedSigned.originalMessage.trim() : "";
    const extraMessageSignature = typeof untypedSigned.messageSignature === "string"
      ? untypedSigned.messageSignature.trim()
      : typeof untypedSigned.signature === "string"
        ? untypedSigned.signature.trim()
        : "";

    return {
      ok: true as const,
      signature: {
        provider,
        signerAddress: signed.signerAddress || address,
        signedMessage: signedPayload.signedMessage,
        originalMessage: (signedPayload.originalMessage ?? extraOriginalMessage) || undefined,
        messageSignature: (signedPayload.messageSignature ?? extraMessageSignature) || undefined,
      } satisfies WalletLoginSignature,
    };
  } catch (error) {
    return {
      ok: false as const,
      message: getErrorMessage(error, `No se pudo firmar el challenge en ${getWalletProviderLabel(provider)}.`),
    };
  }
}

export async function signWalletTransactionXdr(input: {
  wallet: StoredWallet;
  unsignedTxXdr: string;
  networkPassphrase?: string;
}) {
  const address = normalizeAddress(input.wallet.address);
  const provider = normalizeProvider(input.wallet.provider);

  if (!provider) {
    return { ok: false as const, message: "Proveedor de wallet no soportado para firma de transaccion." };
  }
  if (!isValidStellarPublicKey(address)) {
    return { ok: false as const, message: "Wallet invalida para firmar transaccion." };
  }
  if (!input.unsignedTxXdr.trim()) {
    return { ok: false as const, message: "Transaccion invalida para firma." };
  }

  const moduleRef = await getWalletModuleId(provider);
  if (!moduleRef.ok) {
    return { ok: false as const, message: moduleRef.message };
  }

  try {
    moduleRef.runtime.StellarWalletsKit.setWallet(moduleRef.moduleId);
    moduleRef.runtime.StellarWalletsKit.setNetwork(
      resolveKitNetwork(moduleRef.runtime.Networks, input.networkPassphrase),
    );
    const signed = await moduleRef.runtime.StellarWalletsKit.signTransaction(input.unsignedTxXdr, {
      address,
      networkPassphrase: input.networkPassphrase,
    });
    if (!signed.signedTxXdr) {
      return { ok: false as const, message: `No se pudo firmar la transaccion en ${getWalletProviderLabel(provider)}.` };
    }

    return {
      ok: true as const,
      signedTxXdr: signed.signedTxXdr,
      signerAddress: signed.signerAddress || address,
    };
  } catch (error) {
    return {
      ok: false as const,
      message: getErrorMessage(error, `No se pudo firmar la transaccion en ${getWalletProviderLabel(provider)}.`),
    };
  }
}
