import WebSocket from 'ws';

const WS_URL = 'wss://stream.aisstream.io/v0/stream';

export function createAisClient(prisma, onPosition) {
  let ws = null;
  let mmsiList = [];
  let reconnectTimer = null;
  let shouldConnect = false;

  function connect() {
    if (!shouldConnect || mmsiList.length === 0) return;
    if (ws && ws.readyState === WebSocket.CONNECTING) return;

    console.log(`[AIS] Connecting, tracking ${mmsiList.length} vessel(s)...`);
    ws = new WebSocket(WS_URL);

    ws.on('open', () => {
      console.log('[AIS] Connected to AISStream.io');
      ws.send(JSON.stringify({
        Apikey: process.env.AISSTREAM_API_KEY,
        BoundingBoxes: [[[-90, -180], [90, 180]]],
        FiltersShipMMSI: mmsiList,
      }));
    });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        await handleMessage(msg);
      } catch (e) {
        console.error('[AIS] Message error:', e.message);
      }
    });

    ws.on('close', () => {
      console.log('[AIS] Disconnected');
      if (shouldConnect && mmsiList.length > 0) {
        reconnectTimer = setTimeout(connect, 5000);
      }
    });

    ws.on('error', (err) => {
      console.error('[AIS] Error:', err.message);
    });
  }

  async function handleMessage(msg) {
    const { MessageType, Message, MetaData } = msg;
    let posData = null;

    if (MessageType === 'PositionReport') {
      const r = Message.PositionReport;
      posData = {
        mmsi: String(r.UserID).padStart(9, '0'),
        lat: r.Latitude,
        lon: r.Longitude,
        cog: r.Cog,
        sog: r.Sog,
        heading: r.TrueHeading === 511 ? null : r.TrueHeading,
        name: MetaData?.ShipName?.trim() || null,
        timestamp: MetaData?.time_utc || new Date().toISOString(),
      };
    } else if (MessageType === 'StandardClassBPositionReport') {
      const r = Message.StandardClassBPositionReport;
      posData = {
        mmsi: String(r.UserID).padStart(9, '0'),
        lat: r.Latitude,
        lon: r.Longitude,
        cog: r.Cog,
        sog: r.Sog,
        heading: r.TrueHeading === 511 ? null : r.TrueHeading,
        name: MetaData?.ShipName?.trim() || null,
        timestamp: MetaData?.time_utc || new Date().toISOString(),
      };
    }

    if (!posData) return;
    if (!posData.lat || !posData.lon) return;
    if (posData.lat === 0 && posData.lon === 0) return;

    const vessel = await prisma.vessel.findUnique({ where: { mmsi: posData.mmsi } });
    if (!vessel) return;

    // Update vessel name from AIS if not yet known
    if (posData.name && !vessel.name) {
      await prisma.vessel.update({
        where: { id: vessel.id },
        data: { name: posData.name },
      });
    }

    const position = await prisma.position.create({
      data: {
        vesselId: vessel.id,
        lat: posData.lat,
        lon: posData.lon,
        cog: posData.cog,
        sog: posData.sog,
        heading: posData.heading,
        timestamp: new Date(posData.timestamp),
      },
    });

    onPosition({
      vesselId: vessel.id,
      mmsi: posData.mmsi,
      name: posData.name || vessel.name,
      ...position,
    });
  }

  return {
    subscribe(newMmsiList) {
      mmsiList = [...newMmsiList];
      shouldConnect = mmsiList.length > 0;
      clearTimeout(reconnectTimer);

      if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('[AIS] Resubscribing with updated MMSI list');
        ws.close(); // close triggers reconnect with updated mmsiList
      } else if (shouldConnect && (!ws || ws.readyState === WebSocket.CLOSED)) {
        connect();
      }
    },

    disconnect() {
      shouldConnect = false;
      clearTimeout(reconnectTimer);
      ws?.close();
    },
  };
}
