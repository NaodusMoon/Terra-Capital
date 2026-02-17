"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Coins, MessageCircle, Sparkles } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { MARKETPLACE_EVENT, STORAGE_KEYS } from "@/lib/constants";
import { readLocalStorage, writeLocalStorage } from "@/lib/storage";
import type { ChatMessage, ChatThread, PurchaseRecord, TokenizedAsset } from "@/types/market";

type NotificationType = "message" | "purchase" | "asset";

interface NotificationItem {
  id: string;
  type: NotificationType;
  text: string;
  createdAt: string;
  href: string;
}

function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function getCounterpartName(thread: ChatThread, userId: string) {
  return thread.buyerId === userId ? thread.sellerName : thread.buyerName;
}

export function NotificationsBell({ mobile = false }: { mobile?: boolean }) {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(() => {
    if (!user) {
      setItems([]);
      setUnreadCount(0);
      return;
    }

    const threads = readLocalStorage<ChatThread[]>(STORAGE_KEYS.chatThreads, []);
    const messages = readLocalStorage<ChatMessage[]>(STORAGE_KEYS.chatMessages, []);
    const purchases = readLocalStorage<PurchaseRecord[]>(STORAGE_KEYS.purchases, []);
    const assets = readLocalStorage<TokenizedAsset[]>(STORAGE_KEYS.assets, []);
    const lastSeenMap = readLocalStorage<Record<string, string>>(STORAGE_KEYS.notificationsLastSeen, {});
    const lastSeenAt = lastSeenMap[user.id] ?? "1970-01-01T00:00:00.000Z";

    const userThreads = threads.filter((thread) => thread.buyerId === user.id || thread.sellerId === user.id);
    const userThreadIds = new Set(userThreads.map((thread) => thread.id));
    const unreadMessageGroups = userThreads
      .map((thread) => {
        const pending = messages.filter((message) => (
          message.threadId === thread.id
          && message.senderId !== user.id
          && message.status !== "read"
          && message.status !== "failed"
        ));
        if (pending.length === 0) return null;
        const latest = pending.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
        return {
          id: `msg-${thread.id}`,
          type: "message" as const,
          text: `${pending.length} mensaje(s) nuevo(s) de ${getCounterpartName(thread, user.id)}`,
          createdAt: latest.createdAt,
          href: "/chats",
        };
      })
      .filter(Boolean) as NotificationItem[];

    const purchaseItems = purchases
      .filter((purchase) => (purchase.buyerId === user.id || purchase.sellerId === user.id) && +new Date(purchase.purchasedAt) > +new Date(lastSeenAt))
      .map((purchase) => ({
        id: `purchase-${purchase.id}`,
        type: "purchase" as const,
        text: `Nueva compra: ${purchase.quantity} token(s) por ${purchase.totalPaid.toLocaleString("en-US", { maximumFractionDigits: 2 })} USD`,
        createdAt: purchase.purchasedAt,
        href: "/portfolio",
      }));

    const assetItems = assets
      .filter((asset) => asset.sellerId !== user.id && +new Date(asset.createdAt) > +new Date(lastSeenAt))
      .map((asset) => ({
        id: `asset-${asset.id}`,
        type: "asset" as const,
        text: `Nuevo token publicado: ${asset.title}`,
        createdAt: asset.createdAt,
        href: "/buyer",
      }));

    const all = [...unreadMessageGroups, ...purchaseItems, ...assetItems].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    setItems(all.slice(0, 12));
    setUnreadCount(all.length);

    if (userThreadIds.size === 0 && all.length === 0) {
      setItems([]);
      setUnreadCount(0);
    }
  }, [user]);

  useEffect(() => {
    if (loading || !user) return;
    const boot = window.setTimeout(loadNotifications, 0);
    const listener = () => loadNotifications();
    const storageListener = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith("terra_capital_")) loadNotifications();
    };
    const interval = window.setInterval(loadNotifications, 3000);
    window.addEventListener(MARKETPLACE_EVENT, listener);
    window.addEventListener("storage", storageListener);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(interval);
      window.removeEventListener(MARKETPLACE_EVENT, listener);
      window.removeEventListener("storage", storageListener);
    };
  }, [loadNotifications, loading, user]);

  const iconClass = useMemo(() => (
    mobile
      ? "relative grid h-11 w-11 place-items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)]"
      : "relative grid h-11 w-11 place-items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)]"
  ), [mobile]);

  if (loading || !user) return null;

  const shouldPulse = unreadCount > 0 && !open;

  return (
    <div className="relative">
      <motion.button
        type="button"
        className={iconClass}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.93 }}
        animate={shouldPulse ? { rotate: [0, -8, 8, -6, 6, 0], scale: [1, 1.04, 1] } : { rotate: 0, scale: 1 }}
        transition={shouldPulse ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) {
            const lastSeenMap = readLocalStorage<Record<string, string>>(STORAGE_KEYS.notificationsLastSeen, {});
            lastSeenMap[user.id] = new Date().toISOString();
            writeLocalStorage(STORAGE_KEYS.notificationsLastSeen, lastSeenMap);
          }
        }}
        aria-label="Notificaciones"
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <motion.span
            className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-[#22c55e] px-1 text-[10px] font-bold text-[#05220d]"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: [1, 1.14, 1], opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </motion.span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className={`absolute z-50 mt-2 w-[320px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-2xl ${mobile ? "right-0" : "right-0"}`}
          >
            <p className="px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">Notificaciones</p>
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 && (
                <p className="px-2 py-3 text-sm text-[var(--color-muted)]">No hay novedades por ahora.</p>
              )}
              {items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-start gap-2 rounded-xl px-2 py-2 text-sm hover:bg-[var(--color-surface-soft)]"
                  onClick={() => setOpen(false)}
                >
                  {item.type === "message" && <MessageCircle size={16} className="mt-0.5 shrink-0 text-[#10b981]" />}
                  {item.type === "purchase" && <Coins size={16} className="mt-0.5 shrink-0 text-[#f59e0b]" />}
                  {item.type === "asset" && <Sparkles size={16} className="mt-0.5 shrink-0 text-[#38bdf8]" />}
                  <span className="min-w-0">
                    <span className="block truncate">{item.text}</span>
                    <span className="text-xs text-[var(--color-muted)]">{formatShortDate(item.createdAt)}</span>
                  </span>
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
