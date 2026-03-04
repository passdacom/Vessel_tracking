import WebSocket from "ws";

const WS_URL = "wss://stream.aisstream.io/v0/stream";

export function createAisClient(prisma, onPosition) {
  let ws = null;
  let mmsiList = [];
  let reconnectTimer = null;
  let shouldConnect = false;
  let msgCount = 0;

  function connect() {
    if (!shouldConnect || mmsiList.length === 0) return;
    if (ws && ws.readyState === WebSocket.CONNECTING) return;

    console.log("[AIS] Connecting, tracking " + mmsiList.length + " vessel(s)...");
    console.log("[AIS] MMSI list:", mmsiList.join(", "));
    ws = new WebSocket(WS_URL);

    ws.on("open", () => {
      console.log("[AIS] Connected to AISStream.io");
      const subMsg = {
        Apikey: process.env.AISSTREAM_API_KEY,
        // BoundingBoxes removed to prevent 503 ban
        FiltersShipMMSI: mmsiList,
      };
      console.log("[AIS] Subscribing with " + mmsiList.length + " MMSIs");
      ws.send(JSON.stringify(subMsg));
      msgCount = 0;
    });

    ws.on("message", async (raw) => {
      try {
        msgCount++;
        const msg = JSON.parse(raw.toString());
        // 처음 5개 메시지 + 이후 10개마다 로그
        if (msgCount <= 5 || msgCount % 10 === 0) {
          const mmsi = msg.Message?.[msg.MessageType]?.UserID;
          console.log("[AIS] MSG #" + msgCount + " type=" + msg.MessageType + " mmsi=" + mmsi + " ship=" + (msg.MetaData?.ShipName || "?"));
        }
        await handleMessage(msg);
      } catch (e) {
        console.error("[AIS] Message error:", e.message);
      }
    });

    ws.on("close", (code, reason) => {
      console.log("[AIS] Disconnected (code=" + code + ", msgs=" + msgCount + ")");
      if (shouldConnect && mmsiList.length > 0) {
        reconnectTimer = setTimeout(connect, 5000);
      }
    });

    ws.on("error", (err) => {
      console.error("[AIS] Error:", err.message);
    });
  }

  async function handleMessage(msg) {
    const { MessageType, Message, MetaData } = msg;
    let posData = null;

    if (MessageType === "PositionReport") {
      const r = Message.PositionReport;
      posData = {
        mmsi: String(r.UserID).padStart(9, "0"),
        lat: r.Latitude,
        lon: r.Longitude,
        cog: r.Cog,
        sog: r.Sog,
        heading: r.TrueHeading === 511 ? null : r.TrueHeading,
        name: MetaData?.ShipName?.trim() || null,
        timestamp: MetaData?.time_utc || new Date().toISOString(),
      };
    } else if (MessageType === "StandardClassBPositionReport") {
      const r = Message.StandardClassBPositionReport;
      posData = {
        mmsi: String(r.UserID).padStart(9, "0"),
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

    console.log("[AIS] Position: " + posData.mmsi + " (" + posData.name + ") at " + posData.lat.toFixed(4) + "," + posData.lon.toFixed(4) + " sog=" + posData.sog);

    const vessel = await prisma.vessel.findUnique({ where: { mmsi: posData.mmsi } });
    if (!vessel) {
      console.log("[AIS] MMSI " + posData.mmsi + " not in DB, skipping");
      return;
    }

    // AIS에서 선박명 업데이트
    if (posData.name && !vessel.name) {
      await prisma.vessel.update({
        where: { id: vessel.id },
        data: { name: posData.name },
      });
      console.log("[AIS] Updated vessel name: " + posData.name);
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

    console.log("[AIS] Saved position for " + posData.mmsi + " (vessel #" + vessel.id + ")");

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
        console.log("[AIS] Resubscribing with updated MMSI list");
        ws.close();
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
