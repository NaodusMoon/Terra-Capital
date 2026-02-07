import type { AppUser, Session, UserMode } from "@/types/auth";
import { STORAGE_KEYS } from "@/lib/constants";
import { isSafeHttpUrl, isValidStellarPublicKey, normalizeSafeText } from "@/lib/security";
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from "@/lib/storage";

interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
  organization?: string;
  stellarPublicKey?: string;
}

interface LoginInput {
  email: string;
  password: string;
  walletAddress: string;
}

interface UpdateProfileInput {
  fullName: string;
  organization?: string;
  stellarPublicKey?: string;
}

interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

interface RecoverPasswordInput {
  email: string;
  verificationCode: string;
  newPassword: string;
}

interface SellerVerificationInput {
  legalName: string;
  documentLast4: string;
  taxId: string;
  country: string;
  supportUrl?: string;
}

interface LoginAttemptState {
  failCount: number;
  lastFailedAt: string;
  lockUntil?: string;
}

type LoginAttemptsMap = Record<string, LoginAttemptState>;
type RecoveryCodesMap = Record<string, { codeHash: string; salt: string; expiresAt: string }>;

const PASSWORD_ITERATIONS = 120_000;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MINUTES = 15;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizePassword(password: string) {
  return password.trim();
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

async function deriveHash(value: string, salt: string, iterations = PASSWORD_ITERATIONS) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(value), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

function validatePasswordStrength(password: string) {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return "La contraseña debe incluir mayúsculas, minúsculas y al menos 1 número.";
  }
  return null;
}

function getRecoveryCodesMap() {
  return readLocalStorage<RecoveryCodesMap>(STORAGE_KEYS.recoveryCodes, {});
}

function setRecoveryCodesMap(value: RecoveryCodesMap) {
  writeLocalStorage(STORAGE_KEYS.recoveryCodes, value);
}

async function createRecoveryCodeForEmail(email: string) {
  const code = `${Math.floor(100000 + Math.random() * 900000)}`;
  const salt = randomSalt();
  const codeHash = await deriveHash(code, salt);
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const map = getRecoveryCodesMap();
  map[email] = { codeHash, salt, expiresAt };
  setRecoveryCodesMap(map);
  return code;
}

async function verifyRecoveryCode(email: string, verificationCode: string) {
  const map = getRecoveryCodesMap();
  const entry = map[email];
  if (!entry) return false;
  const expires = new Date(entry.expiresAt);
  if (Number.isNaN(expires.getTime()) || expires <= new Date()) {
    delete map[email];
    setRecoveryCodesMap(map);
    return false;
  }
  const computed = await deriveHash(verificationCode.trim(), entry.salt);
  const valid = computed === entry.codeHash;
  if (valid) {
    delete map[email];
    setRecoveryCodesMap(map);
  }
  return valid;
}

function getLoginAttemptsMap() {
  return readLocalStorage<LoginAttemptsMap>(STORAGE_KEYS.loginAttempts, {});
}

function setLoginAttemptsMap(value: LoginAttemptsMap) {
  writeLocalStorage(STORAGE_KEYS.loginAttempts, value);
}

function clearLoginAttempts(email: string) {
  const map = getLoginAttemptsMap();
  if (!map[email]) return;
  delete map[email];
  setLoginAttemptsMap(map);
}

function registerFailedLogin(email: string) {
  const map = getLoginAttemptsMap();
  const now = new Date();
  const current = map[email] ?? { failCount: 0, lastFailedAt: now.toISOString() };
  const nextFailCount = current.failCount + 1;
  const lockUntil = nextFailCount >= LOGIN_MAX_ATTEMPTS
    ? new Date(now.getTime() + LOGIN_LOCK_MINUTES * 60_000).toISOString()
    : undefined;

  map[email] = { failCount: nextFailCount, lastFailedAt: now.toISOString(), lockUntil };
  setLoginAttemptsMap(map);
}

function getActiveLock(email: string) {
  const map = getLoginAttemptsMap();
  const entry = map[email];
  if (!entry?.lockUntil) return null;
  const lockDate = new Date(entry.lockUntil);
  if (Number.isNaN(lockDate.getTime()) || lockDate <= new Date()) {
    delete map[email];
    setLoginAttemptsMap(map);
    return null;
  }
  return lockDate;
}

function writeSession(userId: string, activeMode: UserMode) {
  const session: Session = { userId, activeMode };
  writeLocalStorage(STORAGE_KEYS.session, session);
}

export function getUsers() {
  return readLocalStorage<AppUser[]>(STORAGE_KEYS.users, []);
}

export function getCurrentSession() {
  return readLocalStorage<Session | null>(STORAGE_KEYS.session, null);
}

export function getCurrentUser() {
  const session = getCurrentSession();
  if (!session) return null;
  return getUsers().find((u) => u.id === session.userId) ?? null;
}

export function getActiveMode() {
  const session = getCurrentSession();
  return session?.activeMode ?? "buyer";
}

export async function registerUser(input: RegisterInput) {
  const users = getUsers();
  const email = normalizeEmail(input.email);
  const password = normalizePassword(input.password);
  const fullName = normalizeSafeText(input.fullName, 120);
  const organization = input.organization ? normalizeSafeText(input.organization, 120) : undefined;
  const stellarPublicKey = input.stellarPublicKey?.trim() || undefined;
  if (!fullName) return { ok: false as const, message: "El nombre completo es obligatorio." };
  if (users.some((u) => normalizeEmail(u.email) === email)) return { ok: false as const, message: "Este email ya está registrado." };

  const passwordValidation = validatePasswordStrength(password);
  if (passwordValidation) return { ok: false as const, message: passwordValidation };
  if (stellarPublicKey && !isValidStellarPublicKey(stellarPublicKey)) {
    return { ok: false as const, message: "La wallet Stellar no tiene formato válido (debe iniciar con G...)." };
  }

  const salt = randomSalt();
  const passwordHash = await deriveHash(password, salt);
  const user: AppUser = {
    id: crypto.randomUUID(),
    fullName,
    email,
    passwordHash,
    passwordSalt: salt,
    passwordIterations: PASSWORD_ITERATIONS,
    organization,
    stellarPublicKey,
    sellerVerificationStatus: "unverified",
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  writeLocalStorage(STORAGE_KEYS.users, users);
  clearLoginAttempts(email);
  writeSession(user.id, "buyer");
  return { ok: true as const, user, activeMode: "buyer" as const };
}

export async function loginUser(input: LoginInput) {
  const users = getUsers();
  const email = normalizeEmail(input.email);
  const password = normalizePassword(input.password);
  const walletAddress = input.walletAddress.trim();
  const activeLock = getActiveLock(email);
  if (activeLock) {
    return { ok: false as const, message: `Demasiados intentos fallidos. Intenta de nuevo después de ${activeLock.toLocaleTimeString("es-AR")}.` };
  }

  const user = users.find((u) => normalizeEmail(u.email) === email);
  if (!user) {
    registerFailedLogin(email);
    return { ok: false as const, message: "Credenciales inválidas." };
  }

  let passwordMatches = false;
  if (user.passwordHash && user.passwordSalt) {
    const computedHash = await deriveHash(password, user.passwordSalt, user.passwordIterations ?? PASSWORD_ITERATIONS);
    passwordMatches = computedHash === user.passwordHash;
  }
  if (!passwordMatches) {
    registerFailedLogin(email);
    return { ok: false as const, message: "Credenciales inválidas." };
  }

  if (!isValidStellarPublicKey(walletAddress)) {
    return { ok: false as const, message: "Primero debes conectar una wallet válida." };
  }

  if (user.stellarPublicKey && user.stellarPublicKey !== walletAddress) {
    return { ok: false as const, message: "La wallet conectada no coincide con la wallet registrada en esta cuenta." };
  }

  if (!user.stellarPublicKey) {
    user.stellarPublicKey = walletAddress;
    writeLocalStorage(STORAGE_KEYS.users, users);
  }

  clearLoginAttempts(email);
  const activeMode: UserMode = "buyer";
  writeSession(user.id, activeMode);
  return { ok: true as const, user, activeMode };
}

export function setActiveMode(mode: UserMode) {
  const session = getCurrentSession();
  if (!session) return false;
  writeSession(session.userId, mode);
  return true;
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const users = getUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return { ok: false as const, message: "Usuario no encontrado." };

  const fullName = normalizeSafeText(input.fullName, 120);
  const organization = input.organization ? normalizeSafeText(input.organization, 120) : undefined;
  const stellarPublicKey = input.stellarPublicKey?.trim() || undefined;
  if (!fullName) return { ok: false as const, message: "Nombre inválido." };
  if (stellarPublicKey && !isValidStellarPublicKey(stellarPublicKey)) return { ok: false as const, message: "Wallet pública inválida." };

  user.fullName = fullName;
  user.organization = organization;
  user.stellarPublicKey = stellarPublicKey;
  writeLocalStorage(STORAGE_KEYS.users, users);
  return { ok: true as const, user };
}

export async function changePassword(userId: string, input: ChangePasswordInput) {
  const users = getUsers();
  const user = users.find((u) => u.id === userId);
  if (!user || !user.passwordHash || !user.passwordSalt) {
    return { ok: false as const, message: "Usuario no encontrado." };
  }

  const currentHash = await deriveHash(normalizePassword(input.currentPassword), user.passwordSalt, user.passwordIterations ?? PASSWORD_ITERATIONS);
  if (currentHash !== user.passwordHash) {
    return { ok: false as const, message: "La contraseña actual no coincide." };
  }

  const passwordValidation = validatePasswordStrength(normalizePassword(input.newPassword));
  if (passwordValidation) return { ok: false as const, message: passwordValidation };

  const newSalt = randomSalt();
  user.passwordSalt = newSalt;
  user.passwordHash = await deriveHash(normalizePassword(input.newPassword), newSalt);
  user.passwordIterations = PASSWORD_ITERATIONS;
  writeLocalStorage(STORAGE_KEYS.users, users);
  return { ok: true as const };
}

export async function recoverPassword(input: RecoverPasswordInput) {
  const users = getUsers();
  const user = users.find((u) => normalizeEmail(u.email) === normalizeEmail(input.email));
  if (!user) {
    return { ok: false as const, message: "No se pudo validar la recuperación." };
  }

  const validCode = await verifyRecoveryCode(normalizeEmail(input.email), input.verificationCode);
  if (!validCode) {
    return { ok: false as const, message: "Código de verificación inválido o vencido." };
  }

  const passwordValidation = validatePasswordStrength(normalizePassword(input.newPassword));
  if (passwordValidation) return { ok: false as const, message: passwordValidation };

  const newSalt = randomSalt();
  user.passwordSalt = newSalt;
  user.passwordHash = await deriveHash(normalizePassword(input.newPassword), newSalt);
  user.passwordIterations = PASSWORD_ITERATIONS;
  writeLocalStorage(STORAGE_KEYS.users, users);
  clearLoginAttempts(user.email);
  return { ok: true as const };
}

export async function requestPasswordRecoveryCode(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const users = getUsers();
  const user = users.find((u) => normalizeEmail(u.email) === normalizedEmail);
  if (!user) {
    return { ok: false as const, message: "No encontramos una cuenta con ese correo." };
  }

  const code = await createRecoveryCodeForEmail(normalizedEmail);
  const response = await fetch("/api/auth/recovery-code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: normalizedEmail, code }),
  });

  const payload = (await response.json()) as { ok: boolean; message?: string; devCode?: string };
  if (!payload.ok) {
    return { ok: false as const, message: payload.message ?? "No se pudo enviar el código." };
  }

  return {
    ok: true as const,
    message: payload.message ?? "Código enviado.",
    devCode: payload.devCode,
  };
}

export function submitSellerVerification(userId: string, input: SellerVerificationInput) {
  const users = getUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return { ok: false as const, message: "Usuario no encontrado." };

  const legalName = normalizeSafeText(input.legalName, 120);
  const documentLast4 = normalizeSafeText(input.documentLast4, 4);
  const taxId = normalizeSafeText(input.taxId, 40);
  const country = normalizeSafeText(input.country, 60);
  const supportUrl = input.supportUrl?.trim() || undefined;

  if (!legalName || documentLast4.length !== 4 || !taxId || !country) {
    return { ok: false as const, message: "Completa todos los datos de verificacion requeridos." };
  }
  if (supportUrl && !isSafeHttpUrl(supportUrl)) {
    return { ok: false as const, message: "URL de soporte inválida." };
  }

  user.sellerVerificationData = {
    legalName,
    documentLast4,
    taxId,
    country,
    supportUrl,
    submittedAt: new Date().toISOString(),
  };
  user.sellerVerificationStatus = "pending";
  // Demo: aprobacion inmediata para destrabar funciones en entorno prototipo.
  user.sellerVerificationStatus = "verified";
  writeLocalStorage(STORAGE_KEYS.users, users);
  return { ok: true as const, user };
}

export function logoutUser() {
  removeLocalStorage(STORAGE_KEYS.session);
}
