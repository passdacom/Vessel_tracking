import test from "node:test";
import assert from "node:assert/strict";
import { GeofenceChecker, geofenceChecker } from "../src/services/geofenceChecker.js";
import { createDatalasticPoller } from "../src/services/datalasticPoller.js";

function makePrisma() {
  const events = [];
  const prisma = {
    events,
    vessel: {
      async findMany() {
        return [{ id: 1, name: "Ship", alias: null, mmsi: "123", account: "tenant-a" }];
      },
    },
    position: {
      async findFirst() {
        return { lat: 5, lon: 5, timestamp: new Date("2026-01-01T00:00:00Z") };
      },
    },
    zoneEvent: {
      async findFirst() {
        return events.length > 0 ? events[events.length - 1] : null;
      },
      async create({ data }) {
        const event = { id: events.length + 1, ...data, createdAt: new Date() };
        events.push(event);
        return event;
      },
    },
  };
  prisma.$transaction = async (work) => work(prisma);
  return prisma;
}

test("restart recovery persists and replays a missing geofence entry exactly once", async () => {
  const checker = new GeofenceChecker();
  checker.loaded = true;
  checker.zones = [{
    name: "HRA",
    bbox: [0, 0, 10, 10],
    geometry: { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
  }];
  const prisma = makePrisma();
  const replayed = [];

  const first = await checker.initState(prisma, (event) => replayed.push(event));
  const second = await checker.initState(prisma, (event) => replayed.push(event));

  assert.equal(first.restored, 1);
  assert.equal(second.restored, 0);
  assert.equal(prisma.events.length, 1);
  assert.equal(replayed.length, 1);
  assert.equal(replayed[0].eventType, "entry");
  assert.equal(replayed[0].account, "tenant-a");
  assert.equal(replayed[0].vesselName, "Ship");
});

test("geofence transaction failure leaves state unchanged and retry commits all transitions once", async () => {
  const checker = new GeofenceChecker();
  checker.loaded = true;
  checker.zones = ["A", "B"].map((name) => ({
    name,
    bbox: [0, 0, 10, 10],
    geometry: { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
  }));
  const persisted = [];
  let failTransaction = true;
  const prisma = {
    async $transaction(work) {
      const pending = [];
      const tx = {
        zoneEvent: {
          async create({ data }) {
            if (failTransaction && pending.length === 1) throw new Error("commit failed");
            const event = { id: persisted.length + pending.length + 1, ...data };
            pending.push(event);
            return event;
          },
        },
      };
      try {
        const result = await work(tx);
        persisted.push(...pending);
        return result;
      } finally {
        failTransaction = false;
      }
    },
  };
  const vessel = { id: 9, name: "Atomic", alias: null, mmsi: "900" };
  const position = { lat: 5, lon: 5, timestamp: new Date("2026-01-01T00:00:00Z") };

  const failed = await checker.detectAndSave(prisma, vessel, position);
  assert.deepEqual(failed, []);
  assert.deepEqual(checker.getCurrentZones(vessel.id), []);
  assert.equal(persisted.length, 0);

  const retried = await checker.detectAndSave(prisma, vessel, position);
  const repeated = await checker.detectAndSave(prisma, vessel, position);

  assert.equal(retried.length, 2);
  assert.deepEqual(retried.map((event) => event.zoneName).sort(), ["A", "B"]);
  assert.deepEqual(checker.getCurrentZones(vessel.id).sort(), ["A", "B"]);
  assert.equal(persisted.length, 2);
  assert.deepEqual(repeated, []);
});

test("historical outside-inside-outside points do not replay geofence transitions", async () => {
  const vessel = {
    id: 7,
    name: "Replay Ship",
    alias: null,
    mmsi: "777000777",
    imo: null,
    account: "tenant-a",
    active: true,
    infoFetched: true,
  };
  const events = [];
  const prisma = {
    vessel: {
      async findMany({ where } = {}) {
        if (where?.infoFetched === false) return [];
        return [vessel];
      },
      async update() { return vessel; },
      async findUnique() { return vessel; },
    },
    position: {
      async findFirst() { return null; },
      async upsert({ create }) { return { id: create.timestamp.getTime(), ...create }; },
    },
    apiUsage: { async create() { return {}; } },
    zoneEvent: {
      async create({ data }) { events.push(data); return data; },
    },
  };
  const response = {
    data: {
      name: vessel.name,
      mmsi: vessel.mmsi,
      positions: [
        { lat: 5, lon: -1, speed: 5, course: 90, last_position_epoch: 100 },
        { lat: 5, lon: 5, speed: 5, course: 90, last_position_epoch: 200 },
        { lat: 5, lon: 11, speed: 5, course: 90, last_position_epoch: 300 },
      ],
    },
  };
  const evaluations = [];
  let inside = true;
  const originalDetectAndSave = geofenceChecker.detectAndSave;
  const originalGetCurrentZones = geofenceChecker.getCurrentZones;
  geofenceChecker.detectAndSave = async (db, currentVessel, position) => {
    evaluations.push(position.lon);
    const nowInside = position.lon >= 0 && position.lon <= 10;
    if (inside === nowInside) return [];
    inside = nowInside;
    const event = {
      vesselId: currentVessel.id,
      zoneName: "HRA",
      eventType: nowInside ? "entry" : "exit",
      lat: position.lat,
      lon: position.lon,
      posTimestamp: position.timestamp,
    };
    await db.zoneEvent.create({ data: event });
    return [event];
  };
  geofenceChecker.getCurrentZones = () => inside ? ["HRA"] : [];

  try {
    const poller = createDatalasticPoller(prisma, null, null, null, {
      getCreditStatus: () => ({ remaining: 100, checkedAt: new Date().toISOString() }),
      apiCallFn: async () => response,
    });

    await poller.forceUpdate(() => {});
    await poller.forceUpdate(() => {});

    assert.deepEqual(evaluations, [11, 11]);
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, "exit");
    assert.equal(events[0].posTimestamp.getTime(), 300_000);
  } finally {
    geofenceChecker.detectAndSave = originalDetectAndSave;
    geofenceChecker.getCurrentZones = originalGetCurrentZones;
  }
});
