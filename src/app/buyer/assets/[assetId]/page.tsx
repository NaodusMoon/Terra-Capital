import { RoleGuard } from "@/components/auth/role-guard";
import { BuyerAssetDetailPage } from "@/features/marketplace/components/buyer-asset-detail-page";

export default async function BuyerAssetPage({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  return (
    <RoleGuard mode="buyer">
      <BuyerAssetDetailPage assetId={assetId} />
    </RoleGuard>
  );
}
