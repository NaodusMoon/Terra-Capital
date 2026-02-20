import { RoleGuard } from "@/components/auth/role-guard";
import { SellerAssetsPage } from "@/features/seller/components/seller-assets-page";

export default function SellerAssetsRoute() {
  return (
    <RoleGuard mode="seller">
      <SellerAssetsPage />
    </RoleGuard>
  );
}
