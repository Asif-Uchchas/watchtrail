/**
 * How to hand a stream URL to VLC on each platform.
 *
 * - Android: an intent:// URL that opens VLC directly (falls back to the Play Store page).
 * - iOS / iPadOS: VLC's x-callback-url scheme.
 * - Desktop: a one-line .m3u playlist from /api/playlist. Browsers download it and
 *   Windows/macOS/Linux open it in VLC (VLC registers itself for .m3u on install).
 */

export type Platform = "android" | "ios" | "desktop";

export function detectPlatform(userAgent: string): Platform {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  // iPadOS 13+ reports itself as a Mac; touch support gives it away.
  if (
    /macintosh/i.test(userAgent) &&
    typeof navigator !== "undefined" &&
    navigator.maxTouchPoints > 1
  ) {
    return "ios";
  }
  return "desktop";
}

export function androidVlcIntent(mediaUrl: string, startSeconds?: number): string {
  const url = new URL(mediaUrl);
  const scheme = url.protocol.replace(":", "");
  const rest = mediaUrl.slice(url.protocol.length + 2); // drop "http://"
  const fallback = encodeURIComponent("https://play.google.com/store/apps/details?id=org.videolan.vlc");
  return `intent://${rest}#Intent;scheme=${scheme};type=video/*;package=org.videolan.vlc;${startSeconds && startSeconds > 0 ? `l.position=${Math.round(startSeconds * 1000)};` : ""}S.browser_fallback_url=${fallback};end`;
}

export function iosVlcUrl(mediaUrl: string): string {
  return `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(mediaUrl)}`;
}

export function playlistUrl(mediaUrl: string, title: string, startSeconds?: number): string {
  const params = new URLSearchParams({ u: mediaUrl, t: title });
  if (startSeconds && startSeconds > 0) params.set("s", String(Math.round(startSeconds)));
  return `/api/playlist?${params}`;
}

export function vlcLinkFor(platform: Platform, mediaUrl: string, title: string, startSeconds?: number): string {
  if (platform === "android") return androidVlcIntent(mediaUrl, startSeconds);
  if (platform === "ios") return iosVlcUrl(mediaUrl);
  return playlistUrl(mediaUrl, title, startSeconds);
}
