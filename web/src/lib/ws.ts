const DEFAULT_WS_PATH = "/ws";

export function resolveWebSocketUrl(): string {
  const explicitUrl = (import.meta.env.VITE_WS_URL || "").trim();
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  if (!explicitUrl) {
    return `${protocol}//${window.location.host}${DEFAULT_WS_PATH}`;
  }

  if (explicitUrl.startsWith("ws://") || explicitUrl.startsWith("wss://")) {
    return explicitUrl;
  }

  if (explicitUrl.startsWith("/")) {
    return `${protocol}//${window.location.host}${explicitUrl}`;
  }

  return `${protocol}//${explicitUrl}`;
}
