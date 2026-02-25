const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;
const DATA_URL_MEDIA_REGEX = /^data:((image|video|audio)\/[a-zA-Z0-9.+-]+|application\/pdf|text\/plain);base64,[a-zA-Z0-9+/=\s]+$/;

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
  return DATA_URL_MEDIA_REGEX.test(trimmed);
}

export function getDataUrlByteSize(value: string) {
  const trimmed = value.trim();
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex <= 0) return null;
  const header = trimmed.slice(0, commaIndex);
  const body = trimmed.slice(commaIndex + 1).replace(/\s+/g, "");
  if (!header.endsWith(";base64")) return null;
  if (!/^[a-zA-Z0-9+/=]*$/.test(body)) return null;
  const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
  return Math.floor((body.length * 3) / 4) - padding;
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
