import { useEffect, useRef, useCallback } from 'react';
import { shouldReconnectWebSocket } from './wsReconnect.js';
import { createAuthenticatedWebSocket } from './wsAuth.js';

export function useWebSocket(url, onMessage, options = {}) {
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  const onUnauthorizedRef = useRef(options.onUnauthorized);
  const authToken = options.authToken;
  onMessageRef.current = onMessage;
  onUnauthorizedRef.current = options.onUnauthorized;

  const connect = useCallback(() => {
    if (!url) return;

    const ws = createAuthenticatedWebSocket(url, authToken);
    ws.__intentionalClose = false;
    wsRef.current = ws;

    ws.onopen = () => {
      clearTimeout(reconnectRef.current);
      console.log('[WS] Connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        onMessageRef.current(msg);
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    ws.onclose = (event) => {
      const intentionalClose = ws.__intentionalClose === true;
      const isCurrentSocket = wsRef.current === ws;
      if (isCurrentSocket) wsRef.current = null;
      if (!shouldReconnectWebSocket(event, { intentionalClose, isCurrentSocket })) {
        if (intentionalClose) return;
        if (!isCurrentSocket) return;
        console.warn('[WS] Close suppressed; no reconnect', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        clearTimeout(reconnectRef.current);
        onUnauthorizedRef.current?.(event);
        return;
      }
      console.log('[WS] Disconnected, reconnecting in 3s...', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      reconnectRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      ws.close();
    };
  }, [url, authToken]);

  useEffect(() => {
    if (!url) return;
    const connectTimer = setTimeout(connect, 0);
    return () => {
      clearTimeout(connectTimer);
      clearTimeout(reconnectRef.current);
      const ws = wsRef.current;
      if (!ws) return;
      wsRef.current = null;
      ws.__intentionalClose = true;
      ws.close();
    };
  }, [url, connect]);
}
