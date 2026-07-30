const AUTH_CLOSE_CODES = new Set([1008, 4001, 4401]);

export function isUnauthorizedCloseEvent(event = {}) {
  if (AUTH_CLOSE_CODES.has(event.code)) return true;
  const reason = String(event.reason || "").toLowerCase();
  return reason.includes("unauthor") || reason.includes("auth") || reason.includes("invalid token") || reason.includes("expired");
}

export function shouldReconnectWebSocket(
  event = {},
  { intentionalClose = false, isCurrentSocket = true } = {}
) {
  if (!isCurrentSocket || intentionalClose) return false;
  return !isUnauthorizedCloseEvent(event);
}
