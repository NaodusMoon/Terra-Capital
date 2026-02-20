const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function formatUSD(value: number) {
  return currencyFormatter.format(value);
}

export function formatUSDT(value: number) {
  return `${formatUSD(value)} USDT`;
}

export function formatBpsAsPercent(value: number) {
  return `${(value / 100).toFixed(2)}%`;
}

export function formatShortDate(value: string) {
  return new Date(value).toLocaleString("es-AR", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
