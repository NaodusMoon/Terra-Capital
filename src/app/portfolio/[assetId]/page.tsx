import { PortfolioAssetDetailPage } from "@/features/portfolio/components/portfolio-asset-detail-page";

export default async function PortfolioAssetRoute({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  return <PortfolioAssetDetailPage assetId={assetId} />;
}
