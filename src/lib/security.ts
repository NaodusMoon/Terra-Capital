const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;

export function isValidStellarPublicKey(value: string) {
  return STELLAR_PUBLIC_KEY_REGEX.test(value.trim());
}

export function normalizeSafeText(value: string, maxLength: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function isSafeHttpUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function isSafeMediaDataUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^data:(image|video)\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\s]+$/.test(trimmed);
}

export function toSafeHttpUrlOrUndefined(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  return isSafeHttpUrl(trimmed) ? trimmed : undefined;
}

export function toSafeMediaUrlOrUndefined(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (isSafeHttpUrl(trimmed)) return trimmed;
  return isSafeMediaDataUrl(trimmed) ? trimmed : undefined;
}
