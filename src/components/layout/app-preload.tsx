"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { getAssets, getPurchases, syncMarketplace } from "@/lib/marketplace";

const STATIC_ROUTES = [
  "/",
  "/buyer",
  "/seller",
  "/chats",
  "/portfolio",
  "/seller/assets",
  "/account",
  "/auth/login",
  "/auth/register",
];

function prefetchRoutes(router: ReturnType<typeof useRouter>, pathname: string, routes: string[]) {
  for (const route of routes) {
    if (!route || route === pathname) continue;
    router.prefetch(route);
  }
}

export function AppPreload() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    prefetchRoutes(router, pathname, STATIC_ROUTES);
  }, [pathname, router]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const warmMarketplace = async () => {
      try {
        await syncMarketplace(user.id, { includeChat: true });
      } catch {
        // keep UI responsive even if warmup fails
      }
      if (cancelled) return;

      const assets = getAssets();
      const assetRoutes = assets.flatMap((asset) => [
        `/buyer/assets/${asset.id}`,
        `/seller/assets/${asset.id}`,
      ]);
      const portfolioAssetRoutes = Array.from(new Set(getPurchases().map((purchase) => `/portfolio/${purchase.assetId}`)));
      prefetchRoutes(router, pathname, [...assetRoutes, ...portfolioAssetRoutes]);
    };

    void warmMarketplace();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void warmMarketplace();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname, router, user]);

  return null;
}
