export function createAuthenticatedWebSocket(url, token, WebSocketClass = globalThis.WebSocket) {
  return new WebSocketClass(url, ['vessel-auth', token]);
}