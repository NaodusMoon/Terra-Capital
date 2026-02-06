export type AssetCategory = "cultivo" | "tierra" | "ganaderia";

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
  createdAt: string;
}
