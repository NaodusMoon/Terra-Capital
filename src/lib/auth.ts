import type { AppUser, Session, UserRole } from "@/types/auth";
import { STORAGE_KEYS } from "@/lib/constants";
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from "@/lib/storage";

interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  organization?: string;
  stellarPublicKey?: string;
}

interface LoginInput {
  email: string;
  password: string;
  role: UserRole;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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

  const users = getUsers();
  return users.find((u) => u.id === session.userId) ?? null;
}

export function registerUser(input: RegisterInput) {
  const users = getUsers();
  const email = normalizeEmail(input.email);

  if (users.some((u) => normalizeEmail(u.email) === email)) {
    return { ok: false as const, message: "Este email ya está registrado." };
  }

  const user: AppUser = {
    id: crypto.randomUUID(),
    fullName: input.fullName.trim(),
    email,
    password: input.password,
    role: input.role,
    organization: input.organization?.trim(),
    stellarPublicKey: input.stellarPublicKey?.trim(),
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  writeLocalStorage(STORAGE_KEYS.users, users);

  const session: Session = {
    userId: user.id,
    role: user.role,
  };
  writeLocalStorage(STORAGE_KEYS.session, session);

  return { ok: true as const, user };
}

export function loginUser(input: LoginInput) {
  const users = getUsers();
  const email = normalizeEmail(input.email);

  const user = users.find((u) => normalizeEmail(u.email) === email && u.password === input.password && u.role === input.role);

  if (!user) {
    return {
      ok: false as const,
      message: "Credenciales inválidas o rol incorrecto.",
    };
  }

  const session: Session = {
    userId: user.id,
    role: user.role,
  };

  writeLocalStorage(STORAGE_KEYS.session, session);
  return { ok: true as const, user };
}

export function logoutUser() {
  removeLocalStorage(STORAGE_KEYS.session);
}

