export const STORAGE_KEYS = {
  users: "terra_capital_users",
  session: "terra_capital_session",
  activeMode: "terra_capital_active_mode",
  loginAttempts: "terra_capital_login_attempts",
  pendingWallet: "terra_capital_pending_wallet",
  recoveryCodes: "terra_capital_recovery_codes",
  theme: "terra_capital_theme",
  wallets: "terra_capital_wallets",
  assets: "terra_capital_assets",
  purchases: "terra_capital_purchases",
  chatThreads: "terra_capital_chat_threads",
  chatMessages: "terra_capital_chat_messages",
} as const;

export const TERRA_ASSET_CODES = ["TRLAND", "TRCROP", "TRLIVE"] as const;

export const APP_NAME = "Terra Capital";

export const MARKETPLACE_EVENT = "terra-market-updated";
