export type AssetCategory = "cultivo" | "tierra" | "ganaderia";
export type AssetLifecycleStatus = "FUNDING" | "OPERATING" | "SETTLED";

export interface FundingStatePayload {
  status: "FUNDING";
  funding_progress: number;
  tokens_available: number;
  total_supply: number;
  estimated_apy: string;
}

export interface OperatingStatePayload {
  status: "OPERATING";
  days_remaining: number;
  current_yield_accrued: number;
  health_score: "Optimal" | "Warning" | "Critical";
}

export interface SettledStatePayload {
  status: "SETTLED";
  final_payout_sats: number;
  cycle_performance: string;
  audit_hash: string;
}

export type AssetApiState = FundingStatePayload | OperatingStatePayload | SettledStatePayload;

export interface InvestorMetrics {
  projectedRoi: string;
  cycleProgressPct: number;
  participationPct: number;
  verificationHash: string;
}

export interface SellerMetrics {
  absorptionRatePct: number;
  capitalizationCurrentSats: number;
  capitalizationGoalSats: number;
  retentionPct: number;
  recurringInvestors: number;
}

export interface AssetMediaItem {
  id: string;
  kind: "image" | "video";
  url: string;
}

export interface TokenizedAsset {
  id: string;
  title: string;
  category: AssetCategory;
  description: string;
  location: string;
  pricePerToken: number;
  totalTokens: number;
  availableTokens: number;
  expectedYield: string;
  sellerId: string;
  sellerName: string;
  imageUrl?: string;
  imageUrls?: string[];
  videoUrl?: string;
  mediaGallery?: AssetMediaItem[];
  tokenPriceSats: number;
  cycleDurationDays: 30 | 60 | 90;
  lifecycleStatus: AssetLifecycleStatus;
  cycleStartAt?: string;
  cycleEndAt: string;
  estimatedApyBps: number;
  historicalRoiBps: number;
  proofOfAssetHash: string;
  auditHash?: string;
  healthScore: "Optimal" | "Warning" | "Critical";
  currentYieldAccruedSats: number;
  netProfitSats?: number;
  finalPayoutSats?: number;
  snapshotLockedAt?: string;
  apiState: AssetApiState;
  investorMetrics?: InvestorMetrics;
  sellerMetrics?: SellerMetrics;
  createdAt: string;
}

export interface PurchaseRecord {
  id: string;
  assetId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  quantity: number;
  pricePerToken: number;
  totalPaid: number;
  purchasedAt: string;
}

export interface ChatThread {
  id: string;
  assetId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  senderRole: "buyer" | "seller";
  text: string;
  status: "sending" | "sent" | "read" | "failed";
  kind?: "text" | "image" | "video" | "audio" | "document";
  attachment?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  };
  errorMessage?: string;
  readAt?: string;
  deletedForEveryone?: boolean;
  deletedForEveryoneAt?: string;
  deletedForEveryoneBy?: string;
  createdAt: string;
}
