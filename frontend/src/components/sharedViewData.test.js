import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { getNextSharedMapMode, getRenderableVessels, getSharedMapTileConfig } from "./sharedViewData.js";

test("shared view excludes vessels without positions from map marker rendering", () => {
  const vessels = [
    { id: 64, name: "MERCURY HOPE", positions: [] },
    {
      id: 3,
      name: "GRAND BONANZA",
      positions: [{ lat: 25.1, lon: 54.2, timestamp: "2026-06-22T00:00:00.000Z" }],
    },
  ];

  assert.deepEqual(getRenderableVessels(vessels), [
    {
      vessel: vessels[1],
      position: vessels[1].positions[0],
      positions: vessels[1].positions,
    },
  ]);
});

test("shared map tile config switches between day and night basemaps", () => {
  assert.match(getSharedMapTileConfig("day").url, /light_all/);
  assert.match(getSharedMapTileConfig("night").url, /dark_all/);
  assert.equal(getSharedMapTileConfig("unknown").mode, "day");
  assert.equal(getNextSharedMapMode("day"), "night");
  assert.equal(getNextSharedMapMode("night"), "day");
});

test("shared view Zone OFF unmounts RestrictedZone instead of passing an ignored prop", () => {
  const source = fs.readFileSync(new URL("./SharedView.jsx", import.meta.url), "utf8");
  assert.match(source, /\{showZone\s*&&\s*<RestrictedZone\s*\/>\}/);
  assert.doesNotMatch(source, /<RestrictedZone\s+visible=/);
});
