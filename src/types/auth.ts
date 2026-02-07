export type UserMode = "buyer" | "seller";
export type SellerVerificationStatus = "unverified" | "pending" | "verified";

export interface AppUser {
  id: string;
  fullName: string;
  email: string;
  password?: string;
  passwordHash?: string;
  passwordSalt?: string;
  passwordIterations?: number;
  recoveryHash?: string;
  recoverySalt?: string;
  organization?: string;
  stellarPublicKey?: string;
  sellerVerificationStatus: SellerVerificationStatus;
  sellerVerificationData?: {
    legalName: string;
    documentLast4: string;
    taxId: string;
    country: string;
    supportUrl?: string;
    submittedAt: string;
  };
  createdAt: string;
}

export interface Session {
  userId: string;
  activeMode: UserMode;
}
