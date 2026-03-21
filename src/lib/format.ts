function getLocaleTag() {
  if (typeof document === "undefined") return "es-AR";
  return document.documentElement.lang === "en" ? "en-US" : "es-AR";
}

export function formatUSD(value: number) {
  return new Intl.NumberFormat(getLocaleTag(), {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatUSDT(value: number) {
  return `${formatUSD(value)} USDT`;
}

export function formatBpsAsPercent(value: number) {
  return `${(value / 100).toFixed(2)}%`;
}

export function formatShortDate(value: string) {
  return new Date(value).toLocaleString(getLocaleTag(), {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
