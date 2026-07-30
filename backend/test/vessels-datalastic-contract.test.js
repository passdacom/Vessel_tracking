import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import vesselRoutes from "../src/routes/vessels.js";

function makePrisma() {
  const usage = [];
  const positions = [];
  return {
    usage,
    positions,
    apiUsage: {
      async create({ data }) { usage.push(data); return data; },
    },
    vessel: {
      async findUnique({ where }) {
        if (where.id !== 1) return null;
        return { id: 1, mmsi: "123456789", imo: null, name: "Test", account: "tenant-a" };
      },
    },
    position: {
      async findFirst() { return null; },
      async upsert({ create }) { positions.push(create); return create; },
    },
  };
}

async function withServer(apiCallFn, run) {
  const prisma = makePrisma();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.account = "tenant-a";
    req.accountRole = "admin";
    next();
  });
  app.use("/api/vessels", vesselRoutes(prisma, { apiCallFn }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}`, prisma);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("vessel search unwraps transport responses and charges actual attempts", async () => {
  await withServer(
    async () => ({
      attempted: true,
      attempts: 2,
      response: { data: { name: "Found", mmsi: "123456789", imo: "1234567" } },
      error: null,
    }),
    async (base, prisma) => {
      const response = await fetch(`${base}/api/vessels/search?q=1234567`);
      assert.equal(response.status, 200);
      assert.equal((await response.json())[0].name, "Found");
      assert.equal(prisma.usage.length, 1);
      assert.equal(prisma.usage[0].credits, 2);
    },
  );
});

test("unattempted vessel search fails deterministically without recording usage", async () => {
  await withServer(
    async () => ({
      attempted: false,
      attempts: 0,
      response: { data: [{ name: "stale-result-that-must-not-be-used" }] },
      error: "missing_api_key",
    }),
    async (base, prisma) => {
      const response = await fetch(`${base}/api/vessels/search?q=1234567`);
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: "Datalastic API unavailable" });
      assert.equal(prisma.usage.length, 0);
    },
  );
});

test("manual history charges days per actual transport attempt", async () => {
  await withServer(
    async () => ({
      attempted: true,
      attempts: 2,
      response: { data: { positions: [] } },
      error: null,
    }),
    async (base, prisma) => {
      const response = await fetch(`${base}/api/vessels/1/history`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days: 3 }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { fetched: 0, stored: 0, credits_used: 6 });
      assert.equal(prisma.usage.length, 1);
      assert.equal(prisma.usage[0].credits, 6);
    },
  );
});

test("unattempted manual history fails without recording usage", async () => {
  await withServer(
    async () => ({ attempted: false, attempts: 0, response: null, error: "missing_api_key" }),
    async (base, prisma) => {
      const response = await fetch(`${base}/api/vessels/1/history`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days: 3 }),
      });
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), {
        error: "Datalastic API unavailable",
        credits_used: 0,
      });
      assert.equal(prisma.usage.length, 0);
    },
  );
});

test("manual history preserves zero speed and course", async () => {
  await withServer(
    async () => ({
      attempted: true,
      attempts: 1,
      response: {
        data: {
          positions: [{
            lat: "1",
            lon: "2",
            speed: "0",
            course: "0",
            last_position_epoch: 1_700_000_000,
          }],
        },
      },
      error: null,
    }),
    async (base, prisma) => {
      const response = await fetch(`${base}/api/vessels/1/history`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days: 1 }),
      });
      assert.equal(response.status, 200);
      assert.equal(prisma.positions[0].sog, 0);
      assert.equal(prisma.positions[0].cog, 0);
    },
  );
});
