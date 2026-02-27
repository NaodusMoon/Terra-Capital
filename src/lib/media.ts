import { isSafeHttpUrl } from "@/lib/security";

const IMAGE_EXT_REGEX = /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)(?:$|[?#])/i;
const VIDEO_EXT_REGEX = /\.(m3u8|mov|mp4|mpeg|mpg|m4v|webm|ogv|ogg)(?:$|[?#])/i;

function normalizeMediaUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed || !isSafeHttpUrl(trimmed)) return null;
  return trimmed;
}

function toUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizedHost(raw: string) {
  const parsed = toUrl(raw);
  if (!parsed) return "";
  return parsed.hostname.toLowerCase().replace(/^www\./, "");
}

function extractYoutubeVideoId(parsed: URL, host: string) {
  if (host === "youtu.be") {
    return parsed.pathname.split("/").filter(Boolean)[0] ?? "";
  }
  if (parsed.pathname.startsWith("/shorts/")) {
    return parsed.pathname.split("/").filter(Boolean)[1] ?? "";
  }
  if (parsed.pathname.startsWith("/live/")) {
    return parsed.pathname.split("/").filter(Boolean)[1] ?? "";
  }
  if (parsed.pathname.startsWith("/embed/")) {
    return parsed.pathname.split("/").filter(Boolean)[1] ?? "";
  }
  return parsed.searchParams.get("v") ?? "";
}

export function extractFirstUrl(value: string) {
  const match = value.match(/https?:\/\/[^\s<>"')]+/i);
  return match ? match[0] : null;
}

export function isLikelyImageUrl(raw: string) {
  const normalized = normalizeMediaUrl(raw);
  if (!normalized) return false;
  return IMAGE_EXT_REGEX.test(normalized);
}

export function isLikelyVideoFileUrl(raw: string) {
  const normalized = normalizeMediaUrl(raw);
  if (!normalized) return false;
  return VIDEO_EXT_REGEX.test(normalized);
}

export function getEmbeddableVideoUrl(raw: string) {
  const normalized = normalizeMediaUrl(raw);
  if (!normalized) return null;
  const parsed = toUrl(normalized);
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
    const videoId = extractYoutubeVideoId(parsed, host);
    const cleanId = videoId.trim();
    if (!/^[a-zA-Z0-9_-]{6,20}$/.test(cleanId)) return null;
    return `https://www.youtube-nocookie.com/embed/${cleanId}`;
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const segments = parsed.pathname.split("/").filter(Boolean);
    const videoId = segments.reverse().find((segment) => /^\d+$/.test(segment)) ?? "";
    if (!videoId) return null;
    return `https://player.vimeo.com/video/${videoId}`;
  }

  return null;
}

export function isKnownExternalVideoHost(raw: string) {
  const normalized = normalizeMediaUrl(raw);
  if (!normalized) return false;
  const host = normalizedHost(normalized);
  return host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com" || host === "vimeo.com" || host === "player.vimeo.com";
}

export function getVideoThumbnailUrl(raw: string) {
  const normalized = normalizeMediaUrl(raw);
  if (!normalized) return null;
  const parsed = toUrl(normalized);
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
    const videoId = extractYoutubeVideoId(parsed, host).trim();
    if (!/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) return null;
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }

  return null;
}

export function validateRemoteMediaUrl(raw: string) {
  const normalized = normalizeMediaUrl(raw);
  if (!normalized) return null;
  return normalized;
}

export function inferRemoteMediaKind(raw: string): "image" | "video" {
  const normalized = normalizeMediaUrl(raw);
  if (!normalized) return "image";
  if (getEmbeddableVideoUrl(normalized)) return "video";
  if (isLikelyVideoFileUrl(normalized)) return "video";
  if (isKnownExternalVideoHost(normalized)) return "video";
  if (isLikelyImageUrl(normalized)) return "image";
  return "image";
}
