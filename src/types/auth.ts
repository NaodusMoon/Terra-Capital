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
    documentType?: "national_id" | "passport" | "license";
    documentLast4: string;
    taxId?: string;
    taxIdMasked?: string;
    taxIdHash?: string;
    country: string;
    supportUrl?: string;
    documentEvidence?: {
      frontMimeType: string;
      frontBytes: number;
      frontSha256: string;
      backMimeType?: string;
      backBytes?: number;
      backSha256?: string;
    };
    livenessEvidence?: {
      videoMimeType: string;
      videoBytes: number;
      videoSha256: string;
      score: number;
      detectedFrames: number;
      movementRatio: number;
      challenge: string;
    };
    submittedAt: string;
  };
  createdAt: string;
  updatedAt?: string;
}

export interface Session {
  userId: string;
  activeMode: UserMode;
}
