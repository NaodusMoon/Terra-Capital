import { redirect } from "next/navigation";

export default async function BuyerAssetLegacyPage({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  redirect(`/assets/${assetId}`);
}
