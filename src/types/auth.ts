export type UserRole = "buyer" | "seller";

export interface AppUser {
  id: string;
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  organization?: string;
  stellarPublicKey?: string;
  createdAt: string;
}

export interface Session {
  userId: string;
  role: UserRole;
}

