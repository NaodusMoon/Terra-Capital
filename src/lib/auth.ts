import type { AppUser, Session, UserMode } from "@/types/auth";
import { STORAGE_KEYS } from "@/lib/constants";
import { isValidStellarPublicKey, normalizeSafeText } from "@/lib/security";
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from "@/lib/storage";

interface LoginInput {
  walletAddress: string;
  fullName?: string;
}

interface UpdateProfileInput {
  fullName: string;
  organization?: string;
  stellarPublicKey: string;
}

interface SellerVerificationInput {
  legalName: string;
  documentLast4: string;
  taxId: string;
  country: string;
  supportUrl?: string;
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

interface LocalUsersMap {
  [walletAddress: string]: AppUser;
}

function writeSession(userId: string, activeMode: UserMode) {
  const session: Session = { userId, activeMode };
  writeLocalStorage(STORAGE_KEYS.session, session);
}

function writeCurrentUser(user: AppUser) {
  writeLocalStorage(STORAGE_KEYS.authUser, user);
}

function readLocalUsers() {
  return readLocalStorage<LocalUsersMap>(STORAGE_KEYS.users, {});
}

function writeLocalUsers(users: LocalUsersMap) {
  writeLocalStorage(STORAGE_KEYS.users, users);
}

function loginWithLocalFallback(walletAddress: string, fullName: string) {
  const users = readLocalUsers();
  const existing = users[walletAddress];
  const now = new Date().toISOString();

  if (existing) {
    const updatedUser: AppUser = fullName && fullName !== existing.fullName
      ? { ...existing, fullName, updatedAt: now }
      : existing;
    users[walletAddress] = updatedUser;
    writeLocalUsers(users);
    writeCurrentUser(updatedUser);
    writeSession(updatedUser.id, "buyer");
    return { ok: true as const, user: updatedUser, activeMode: "buyer" as const, isNewUser: false as const };
  }

  if (!fullName) {
    return {
      ok: false as const,
      requiresName: true as const,
      message: "Primer acceso: indica tu nombre para crear el perfil.",
    };
  }

  const newUser: AppUser = {
    id: crypto.randomUUID(),
    fullName,
    organization: undefined,
    stellarPublicKey: walletAddress,
    sellerVerificationStatus: "unverified",
    sellerVerificationData: undefined,
    createdAt: now,
    updatedAt: now,
  };
  users[walletAddress] = newUser;
  writeLocalUsers(users);
  writeCurrentUser(newUser);
  writeSession(newUser.id, "buyer");
  return { ok: true as const, user: newUser, activeMode: "buyer" as const, isNewUser: true as const };
}

export function getCurrentSession() {
  return readLocalStorage<Session | null>(STORAGE_KEYS.session, null);
}

export function getCurrentUser() {
  return readLocalStorage<AppUser | null>(STORAGE_KEYS.authUser, null);
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
  const fullName = normalizeSafeText(input.fullName ?? "", 120);
  if (!isValidStellarPublicKey(walletAddress)) {
    return { ok: false as const, message: "Primero debes conectar una wallet valida." };
  }
  try {
    const response = await fetch("/api/auth/wallet-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress,
        fullName: fullName || undefined,
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
    return loginWithLocalFallback(walletAddress, fullName);
  }
}

export function setActiveMode(mode: UserMode) {
  const session = getCurrentSession();
  if (!session) return false;
  writeSession(session.userId, mode);
  return true;
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const fullName = normalizeSafeText(input.fullName, 120);
  const organization = input.organization ? normalizeSafeText(input.organization, 120) : "";
  const stellarPublicKey = input.stellarPublicKey.trim();

  if (!fullName) return { ok: false as const, message: "Nombre invalido." };
  if (!isValidStellarPublicKey(stellarPublicKey)) return { ok: false as const, message: "Wallet publica invalida." };

  const response = await fetch("/api/auth/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
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

export async function submitSellerVerification(userId: string, input: SellerVerificationInput) {
  const response = await fetch("/api/auth/seller-verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, ...input }),
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

export function logoutUser() {
  removeLocalStorage(STORAGE_KEYS.session);
  removeLocalStorage(STORAGE_KEYS.authUser);
}
