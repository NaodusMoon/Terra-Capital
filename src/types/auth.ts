export type UserMode = "buyer" | "seller";
export type SellerVerificationStatus = "unverified" | "pending" | "verified";

export interface AppUser {
  id: string;
  fullName: string;
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
  updatedAt?: string;
}

export interface Session {
  userId: string;
  activeMode: UserMode;
}
