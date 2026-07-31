import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const moduleUrl = new URL("./components/Map/mapStatus.js", import.meta.url);

test("map status presents the current reference and alert rule versions", async () => {
  assert.equal(fs.existsSync(moduleUrl), true, "map status contract module is missing");
  const { MAP_RISK_STATUS } = await import(moduleUrl);
  assert.deepEqual(MAP_RISK_STATUS, {
    referenceLabel: "JWLA-034 Reference",
    alertLabel: "Alerts: JWLA-033",
    sourceUrl: "https://lmalloyds.com/wp-content/uploads/2025/06/JWLA-034-Saudi-Arabia.pdf",
  });
});

test("map status formats cursor coordinates and zoom without inventing a location", async () => {
  assert.equal(fs.existsSync(moduleUrl), true, "map status contract module is missing");
  const { formatMapStatus } = await import(moduleUrl);
  assert.equal(formatMapStatus(null, 5), "Lat —  Lon —  · Z5");
  assert.equal(formatMapStatus({ lat: 37.123456, lng: 128.987654 }, 7), "Lat 37.1235  Lon 128.9877  · Z7");
  assert.equal(formatMapStatus({ lat: Number.NaN, lng: 20 }, 3), "Lat —  Lon —  · Z3");
});
