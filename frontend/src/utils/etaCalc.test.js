import test from "node:test";
import assert from "node:assert/strict";
import { calcEta, formatHours } from "./etaCalc.js";

test("calcEta falls back to straight-line distance when no lane is available", () => {
  const result = calcEta(
    { lat: 0, lon: 0, sog: 10 },
    { lat: 0, lon: 1 },
    []
  );

  assert.equal(result.usedFallback, true);
  assert.equal(result.laneId, null);
  assert.ok(result.total > 59);
  assert.ok(result.total < 61);
  assert.equal(result.effectiveSog, 10);
});

test("calcEta selects the shortest active lane path", () => {
  const lanes = [
    {
      id: 1,
      name: "Long detour",
      color: "#ef4444",
      coordinates: [[0, 0], [0, 5], [1, 5], [1, 1]],
    },
    {
      id: 2,
      name: "Direct lane",
      color: "#22c55e",
      coordinates: [[0, 0], [1, 1]],
    },
  ];

  const result = calcEta(
    { lat: 0, lon: 0, sog: 12 },
    { lat: 1, lon: 1 },
    lanes
  );

  assert.equal(result.usedFallback, false);
  assert.equal(result.laneId, 2);
  assert.equal(result.laneName, "Direct lane");
  assert.ok(result.total > 80);
  assert.ok(result.total < 90);
});

test("calcEta connects nearby lanes for shared trunk and branch routes", () => {
  const lanes = [
    {
      id: 1,
      name: "Korea - Persian Gulf",
      color: "#2563eb",
      coordinates: [
        [126.5, 34.5],
        [104.0, 1.3],
        [80.0, 5.5],
        [56.0, 25.0],
      ],
    },
    {
      id: 2,
      name: "Sri Lanka South - Karachi",
      color: "#f59e0b",
      coordinates: [
        [80.2, 5.7],
        [67.0, 24.8],
      ],
    },
  ];

  const result = calcEta(
    { lat: 1.35, lon: 104.05, sog: 12 },
    { lat: 24.8, lon: 67.0 },
    lanes
  );

  assert.equal(result.usedFallback, false);
  assert.equal(result.routeSegments.filter((s) => s.type === "lane").length, 2);
  assert.deepEqual(
    result.routeSegments.filter((s) => s.type === "lane").map((s) => s.laneId),
    [1, 2]
  );
  assert.ok(result.laneSegDist > 2800);
  assert.ok(result.laneSegDist < 2900);
  assert.ok(result.total < 2900);
});

test("calcEta uses default speed when vessel is stopped and no override is provided", () => {
  const result = calcEta(
    { lat: 0, lon: 0, sog: 0 },
    { lat: 0, lon: 1 },
    []
  );

  assert.equal(result.usedFallback, true);
  assert.equal(result.effectiveSog, 12);
});

test("formatHours renders day, hour, and minute ranges", () => {
  assert.equal(formatHours(28), "1일 4시간");
  assert.equal(formatHours(2.5), "2시간 30분");
  assert.equal(formatHours(0.75), "45분");
});
