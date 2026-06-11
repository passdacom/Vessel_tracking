import { useEffect, useRef, useCallback } from 'react';
import { shouldReconnectWebSocket } from './wsReconnect.js';

export function useWebSocket(url, onMessage, options = {}) {
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  const onUnauthorizedRef = useRef(options.onUnauthorized);
  onMessageRef.current = onMessage;
  onUnauthorizedRef.current = options.onUnauthorized;

  const connect = useCallback(() => {
    if (!url) return;

    const ws = new WebSocket(url);
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
      if (!shouldReconnectWebSocket(event, { intentionalClose })) {
        if (intentionalClose) return;
        console.warn('[WS] Unauthorized close; suppressing reconnect');
        clearTimeout(reconnectRef.current);
        onUnauthorizedRef.current?.(event);
        return;
      }
      console.log('[WS] Disconnected, reconnecting in 3s...');
      reconnectRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [url]);

  useEffect(() => {
    if (!url) return;
    connect();
    return () => {
      clearTimeout(reconnectRef.current);
      if (wsRef.current) wsRef.current.__intentionalClose = true;
      wsRef.current?.close();
    };
  }, [url, connect]);
}
