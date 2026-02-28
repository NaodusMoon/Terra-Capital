import type { AppUser, Session, UserMode } from "@/types/auth";
import { PLATFORM_OWNER_WALLET, STORAGE_KEYS } from "@/lib/constants";
import { isValidStellarPublicKey, normalizeSafeText } from "@/lib/security";
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from "@/lib/storage";
import { signWalletLoginChallenge, type WalletProviderId } from "@/lib/wallet";

interface LoginInput {
  walletAddress: string;
  walletProvider: WalletProviderId;
  fullName?: string;
}

interface UpdateProfileInput {
  fullName: string;
  organization?: string;
  stellarPublicKey: string;
}

interface SellerVerificationInput {
  legalName: string;
  documentType: "national_id" | "passport" | "license";
  documentLast4: string;
  taxId: string;
  country: string;
  supportUrl?: string;
  documentFrontDigest: {
    mimeType: string;
    bytes: number;
    sha256: string;
  };
  documentBackDigest?: {
    mimeType: string;
    bytes: number;
    sha256: string;
  };
  livenessVideoDigest: {
    mimeType: string;
    bytes: number;
    sha256: string;
  };
  livenessScore: number;
  livenessDetectedFrames: number;
  livenessMovementRatio: number;
  livenessChallenge: string;
}

type LoginApiSuccess = {
  ok: true;
  user: AppUser;
  isNewUser: boolean;
};

type LoginApiFailure = {
  ok: false;
  message: string;
  requiresName?: boolean;
};

type ChallengeApiSuccess = {
  ok: true;
  challengeId: string;
  message: string;
  expiresAt: number;
};

type ChallengeApiFailure = {
  ok: false;
  message: string;
};

interface AdminAccountsPayload {
  ok: boolean;
  users?: AppUser[];
  message?: string;
}

function writeSession(userId: string, activeMode: UserMode) {
  const session: Session = { userId, activeMode };
  writeLocalStorage(STORAGE_KEYS.session, session);
}

function writeCurrentUser(user: AppUser) {
  writeLocalStorage(STORAGE_KEYS.authUser, user);
}

export function getCurrentSession() {
  return readLocalStorage<Session | null>(STORAGE_KEYS.session, null);
}

export function getCurrentUser() {
  const raw = readLocalStorage<AppUser | null>(STORAGE_KEYS.authUser, null);
  if (!raw) return null;
  const ownerWallet = (raw.stellarPublicKey ?? "").trim().toUpperCase() === PLATFORM_OWNER_WALLET;
  return {
    ...raw,
    appRole: ownerWallet ? "admin" : (raw.appRole ?? "user"),
    buyerVerificationStatus: raw.buyerVerificationStatus ?? "unverified",
    sellerVerificationStatus: raw.sellerVerificationStatus ?? "unverified",
  };
}

export function getActiveMode() {
  const session = getCurrentSession();
  return session?.activeMode ?? "buyer";
}

async function parseResponse<T>(response: Response): Promise<T | null> {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function loginUser(input: LoginInput) {
  const walletAddress = input.walletAddress.trim();
  const walletProvider = input.walletProvider;
  const fullName = normalizeSafeText(input.fullName ?? "", 120);
  if (!isValidStellarPublicKey(walletAddress)) {
    return { ok: false as const, message: "Primero debes conectar una wallet valida." };
  }
  if (walletProvider === "manual") {
    return { ok: false as const, message: "Conecta una wallet para login seguro." };
  }
  try {
    const challengeResponse = await fetch("/api/auth/wallet-login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "challenge",
        walletAddress,
        walletProvider,
      }),
    });
    const challengePayload = await parseResponse<ChallengeApiSuccess | ChallengeApiFailure>(challengeResponse);
    if (!challengePayload?.ok) {
      return { ok: false as const, message: challengePayload?.message ?? "No se pudo iniciar challenge de login." };
    }

    const signatureResult = await signWalletLoginChallenge({
      wallet: { address: walletAddress, provider: walletProvider },
      challengeMessage: challengePayload.message,
    });
    if (!signatureResult.ok) {
      return { ok: false as const, message: signatureResult.message };
    }

    const response = await fetch("/api/auth/wallet-login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "verify",
        walletAddress,
        walletProvider,
        challengeId: challengePayload.challengeId,
        fullName: fullName || undefined,
        signature: signatureResult.signature,
      }),
    });
    const payload = await parseResponse<LoginApiSuccess | LoginApiFailure>(response);
    if (!payload) {
      return { ok: false as const, message: "Respuesta invalida del servidor." };
    }
    if (!payload.ok) {
      const maybeDbConfigIssue = payload.message.toLowerCase().includes("database_url");
      if (maybeDbConfigIssue) {
        return {
          ok: false as const,
          message: payload.message,
          requiresName: payload.requiresName ?? false,
        };
      }
      return {
        ok: false as const,
        message: payload.message,
        requiresName: payload.requiresName ?? false,
      };
    }

    const activeMode: UserMode = "buyer";
    writeCurrentUser(payload.user);
    writeSession(payload.user.id, activeMode);
    return { ok: true as const, user: payload.user, activeMode, isNewUser: payload.isNewUser };
  } catch {
    return { ok: false as const, message: "No se pudo conectar al servidor para validar la firma del login." };
  }
}

export function setActiveMode(mode: UserMode) {
  const session = getCurrentSession();
  if (!session) return false;
  writeSession(session.userId, mode);
  return true;
}

export async function updateProfile(input: UpdateProfileInput) {
  const fullName = normalizeSafeText(input.fullName, 120);
  const organization = input.organization ? normalizeSafeText(input.organization, 120) : "";
  const stellarPublicKey = input.stellarPublicKey.trim();

  if (!fullName) return { ok: false as const, message: "Nombre invalido." };
  if (!isValidStellarPublicKey(stellarPublicKey)) return { ok: false as const, message: "Wallet publica invalida." };

  const response = await fetch("/api/auth/profile", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName,
      organization: organization || undefined,
      stellarPublicKey,
    }),
  });

  const payload = await parseResponse<{ ok: boolean; user?: AppUser; message?: string }>(response);
  if (!payload) {
    return { ok: false as const, message: "Respuesta invalida del servidor." };
  }
  if (!payload.ok || !payload.user) {
    return { ok: false as const, message: payload.message ?? "No se pudo actualizar el perfil." };
  }

  writeCurrentUser(payload.user);
  return { ok: true as const, user: payload.user };
}

export async function submitSellerVerification(input: SellerVerificationInput) {
  const response = await fetch("/api/auth/seller-verification", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input }),
  });

  const payload = await parseResponse<{ ok: boolean; user?: AppUser; message?: string }>(response);
  if (!payload) {
    return { ok: false as const, message: "Respuesta invalida del servidor." };
  }
  if (!payload.ok || !payload.user) {
    return { ok: false as const, message: payload.message ?? "No se pudo enviar la verificacion." };
  }

  writeCurrentUser(payload.user);
  return { ok: true as const, user: payload.user };
}

export async function listAdminAccounts() {
  const response = await fetch("/api/auth/admin/accounts", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  const payload = await parseResponse<AdminAccountsPayload>(response);
  if (!payload || !payload.ok || !payload.users) {
    return { ok: false as const, message: payload?.message ?? "No se pudieron cargar las cuentas." };
  }
  return { ok: true as const, users: payload.users };
}

export async function updateAdminAccount(input: {
  targetUserId: string;
  appRole?: "user" | "dev" | "admin";
  buyerVerificationStatus?: "unverified" | "verified";
  sellerVerificationStatus?: "unverified" | "pending" | "verified";
}) {
  const response = await fetch("/api/auth/admin/accounts", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await parseResponse<{ ok: boolean; user?: AppUser; message?: string }>(response);
  if (!payload || !payload.ok || !payload.user) {
    return { ok: false as const, message: payload?.message ?? "No se pudo actualizar la cuenta." };
  }
  return { ok: true as const, user: payload.user };
}

export function logoutUser() {
  fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  }).catch(() => undefined);
  removeLocalStorage(STORAGE_KEYS.session);
  removeLocalStorage(STORAGE_KEYS.authUser);
}
