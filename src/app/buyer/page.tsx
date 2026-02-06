import { RoleGuard } from "@/components/auth/role-guard";
import { BuyerDashboard } from "@/features/dashboard/components/buyer-dashboard";

export default function BuyerPage() {
  return (
    <RoleGuard role="buyer">
      <BuyerDashboard />
    </RoleGuard>
  );
}

