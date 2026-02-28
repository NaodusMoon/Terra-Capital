export const STORAGE_KEYS = {
  users: "terra_capital_users",
  authUser: "terra_capital_auth_user",
  session: "terra_capital_session",
  activeMode: "terra_capital_active_mode",
  loginAttempts: "terra_capital_login_attempts",
  pendingWallet: "terra_capital_pending_wallet",
  lastWalletProvider: "terra_capital_last_wallet_provider",
  recoveryCodes: "terra_capital_recovery_codes",
  theme: "terra_capital_theme",
  wallets: "terra_capital_wallets",
  stellarNetwork: "terra_capital_stellar_network",
  assets: "terra_capital_assets",
  purchases: "terra_capital_purchases",
  chatThreads: "terra_capital_chat_threads",
  chatMessages: "terra_capital_chat_messages",
  chatFavorites: "terra_capital_chat_favorites",
  notificationsLastSeen: "terra_capital_notifications_last_seen",
  blendSnapshot: "terra_capital_blend_snapshot",
} as const;

export const TERRA_ASSET_CODES = ["TRLAND", "TRCROP", "TRLIVE"] as const;

export const APP_NAME = "Terra Capital";
export const PLATFORM_OWNER_NAME = "Naodus";
export const PLATFORM_OWNER_WALLET = "GDQM3R3UTY7M4QJGNANWZ4QXQYADQCMM65FZFAD3Y6Y7UOCKFYNFDI3J";

export const MARKETPLACE_EVENT = "terra-market-updated";
