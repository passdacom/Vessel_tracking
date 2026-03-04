import WebSocket from "ws";
const API_KEY = "b1ebded485bc40f168dcbc480edb1bc1ac10de84";
const TARGET = ["352978156","441393000","441708000","440323000","441046000"];
console.log("[NOFILTER] BoundingBox만 사용, 중동 해역 (선박들 현재 위치)");
const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
let count = 0;
let matched = 0;
ws.on("open", () => {
  console.log("[NOFILTER] Connected!");
  const msg = { Apikey: API_KEY, BoundingBoxes: [[[20,45],[30,60]]] };
  ws.send(JSON.stringify(msg));
  console.log("[NOFILTER] Subscribed to Middle East bbox");
});
ws.on("message", (raw) => {
  count++;
  const m = JSON.parse(raw.toString());
  const mmsi = String(m.Message?.[m.MessageType]?.UserID || "");
  if (TARGET.includes(mmsi)) {
    matched++;
    console.log("[NOFILTER] MATCH! #" + matched + " MMSI=" + mmsi + " type=" + m.MessageType + " ship=" + (m.MetaData?.ShipName || "?"));
  }
  if (count <= 3) console.log("[NOFILTER] msg #" + count + " mmsi=" + mmsi + " type=" + m.MessageType);
  if (count === 10) console.log("[NOFILTER] 10 msgs received, matched=" + matched);
  if (count === 50) console.log("[NOFILTER] 50 msgs received, matched=" + matched);
});
ws.on("close", (code) => {
  console.log("[NOFILTER] CLOSED code=" + code + " total=" + count + " matched=" + matched);
});
setTimeout(() => { console.log("[NOFILTER] 60s timeout, total=" + count + " matched=" + matched); ws.close(); process.exit(0); }, 60000);
