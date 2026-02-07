import { RoleGuard } from "@/components/auth/role-guard";
import { SellerDashboard } from "@/features/dashboard/components/seller-dashboard";

export default function SellerPage() {
  return (
    <RoleGuard mode="seller">
      <SellerDashboard />
    </RoleGuard>
  );
}

