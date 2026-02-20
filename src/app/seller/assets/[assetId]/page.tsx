import { RoleGuard } from "@/components/auth/role-guard";
import { SellerAssetDetailPage } from "@/features/seller/components/seller-asset-detail-page";

export default async function SellerAssetRoute({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  return (
    <RoleGuard mode="seller">
      <SellerAssetDetailPage assetId={assetId} />
    </RoleGuard>
  );
}
