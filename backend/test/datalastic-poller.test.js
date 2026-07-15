import test from "node:test";
import assert from "node:assert/strict";
import { apiCall, createDatalasticPoller } from "../src/services/datalasticPoller.js";

function makeVessels(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    mmsi: String(100000000 + index),
    imo: null,
    account: `tenant-${index + 1}`,
    alias: `Vessel ${index + 1}`,
    name: null,
    active: true,
  }));
}

function makePrisma(vessels, settings = {}) {
  let activeFinds = 0;
  const positions = [];
  const usage = [];
  return {
    get activeFinds() { return activeFinds; },
    positions,
    usage,
    vessel: {
      async findMany({ where } = {}) {
        if (where?.infoFetched === false) return [];
        if (where?.active === true) activeFinds += 1;
        return vessels;
      },
      async update() { return {}; },
      async findUnique({ where }) { return vessels.find((v) => v.id === where.id) || null; },
    },
    position: {
      async findFirst({ where } = {}) {
        return settings.latestPositions?.[where?.vesselId] || null;
      },
      async upsert({ create }) {
        const position = { id: positions.length + 1, ...create };
        positions.push(position);
        return position;
      },
    },
    zoneEvent: {
      async create({ data }) { return data; },
    },
    apiUsage: {
      async create({ data }) { usage.push(data); return data; },
    },
    systemConfig: {
      async findUnique({ where }) {
        return Object.hasOwn(settings, where.key) ? { key: where.key, value: settings[where.key] } : null;
      },
    },
  };
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

test("apiCall skips transport when no API key is configured", async () => {
  let fetches = 0;
  const result = await apiCall("vessel_history", { mmsi: "123" }, {
    apiKey: "",
    fetchFn: async () => { fetches += 1; },
  });

  assert.deepEqual(result, { attempted: false, attempts: 0, response: null, error: "missing_api_key" });
  assert.equal(fetches, 0);
});

for (const status of [429, 503]) {
  test(`apiCall retries retryable HTTP ${status} only to the configured cap`, async () => {
    let fetches = 0;
    const sleeps = [];
    const result = await apiCall("vessel_history", { mmsi: "123" }, {
      apiKey: "test-key",
      maxAttempts: 3,
      fetchFn: async () => { fetches += 1; return jsonResponse({ error: "retry" }, status); },
      sleepFn: async (delay) => { sleeps.push(delay); },
      jitterFn: () => 0,
    });

    assert.equal(fetches, 3);
    assert.equal(result.attempted, true);
    assert.equal(result.attempts, 3);
    assert.equal(result.response, null);
    assert.equal(result.error, `http_${status}`);
    assert.equal(sleeps.length, 2);
  });
}

test("apiCall does not retry a non-retryable 4xx response", async () => {
  let fetches = 0;
  const result = await apiCall("vessel_history", { mmsi: "123" }, {
    apiKey: "test-key",
    fetchFn: async () => { fetches += 1; return jsonResponse({ error: "bad request" }, 400); },
    sleepFn: async () => assert.fail("400 must not sleep for retry"),
  });

  assert.equal(fetches, 1);
  assert.equal(result.error, "http_400");
});

test("apiCall rejects oversized and invalid JSON bodies without exposing content", async () => {
  const oversized = await apiCall("vessel_history", {}, {
    apiKey: "test-key",
    maxResponseBytes: 8,
    fetchFn: async () => new Response("123456789", { status: 200 }),
  });
  const invalid = await apiCall("vessel_history", {}, {
    apiKey: "test-key",
    fetchFn: async () => new Response("not-json", { status: 200 }),
  });

  assert.equal(oversized.error, "response_too_large");
  assert.equal(invalid.error, "invalid_json");
  assert.equal(oversized.response, null);
  assert.equal(invalid.response, null);
});

test("a timed out transport releases the single-flight lock for the next poll", async () => {
  const prisma = makePrisma(makeVessels(1));
  let fetches = 0;
  const poller = createDatalasticPoller(prisma, null, null, null, {
    getCreditStatus: () => ({ remaining: 100 }),
    apiCallFn: (endpoint, params) => apiCall(endpoint, params, {
      apiKey: "test-key",
      timeoutMs: 5,
      maxAttempts: 1,
      fetchFn: (_url, { signal }) => new Promise((resolve, reject) => {
        fetches += 1;
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    }),
  });

  await poller.forceUpdate(() => {});
  assert.equal(poller.getRunState().running, false);
  await poller.forceUpdate(() => {});

  assert.equal(fetches, 2);
  assert.equal(prisma.activeFinds, 2);
});

test("no-key transport outcome does not create API usage", async () => {
  const prisma = makePrisma(makeVessels(1));
  const poller = createDatalasticPoller(prisma, null, null, null, {
    getCreditStatus: () => ({ remaining: 100 }),
    apiCallFn: (endpoint, params) => apiCall(endpoint, params, { apiKey: "" }),
  });

  await poller.forceUpdate(() => {});

  assert.equal(prisma.usage.length, 0);
});

test("position parsing preserves zero speed and course", async () => {
  const vessel = makeVessels(1)[0];
  const prisma = makePrisma([vessel]);
  const poller = createDatalasticPoller(prisma, null, null, null, {
    getCreditStatus: () => ({ remaining: 100 }),
    apiCallFn: async () => ({
      data: {
        name: vessel.mmsi,
        mmsi: vessel.mmsi,
        positions: [{ lat: "1", lon: "2", speed: "0", course: "0", last_position_epoch: 1_700_000_000 }],
      },
    }),
  });

  await poller.forceUpdate(() => {});

  assert.equal(prisma.positions[0].sog, 0);
  assert.equal(prisma.positions[0].cog, 0);
});

test("start honors poll_enabled=false without startup calls or a cron task", async () => {
  const prisma = makePrisma(makeVessels(1), {
    poll_enabled: "false",
    poll_cron: "*/5 * * * *",
  });
  let apiCalls = 0;
  let schedules = 0;
  const cronImpl = {
    validate: () => true,
    schedule: () => { schedules += 1; return { stop() {} }; },
  };
  const poller = createDatalasticPoller(prisma, null, null, null, {
    apiCallFn: async () => { apiCalls += 1; return null; },
    cronImpl,
  });

  const started = await poller.start();

  assert.equal(started, false);
  assert.equal(apiCalls, 0);
  assert.equal(schedules, 0);
  assert.equal(poller.getCron(), null);
});

test("invalid reload keeps the existing cron task and reports failure", async () => {
  const stopped = [];
  const scheduled = [];
  const cronImpl = {
    validate: (expression) => expression === "*/5 * * * *",
    schedule: (expression) => {
      scheduled.push(expression);
      return { stop() { stopped.push(expression); } };
    },
  };
  const poller = createDatalasticPoller(makePrisma([]), null, null, null, { cronImpl });

  assert.equal(poller.reload("*/5 * * * *"), true);
  assert.equal(poller.reload("not a cron"), false);
  assert.deepEqual(scheduled, ["*/5 * * * *"]);
  assert.deepEqual(stopped, []);
  assert.equal(poller.getCron(), "*/5 * * * *");
});

function historyResponse(params) {
  return {
    data: {
      name: params.mmsi,
      mmsi: params.mmsi,
      positions: [{
        lat: "1.0",
        lon: "2.0",
        speed: "10",
        course: "90",
        last_position_epoch: 1_700_000_000,
      }],
    },
  };
}

test("manual poll is single-flight and limits concurrent Datalastic requests", async () => {
  const vessels = makeVessels(8);
  const prisma = makePrisma(vessels);
  let inFlight = 0;
  let maxInFlight = 0;
  let calls = 0;
  const poller = createDatalasticPoller(prisma, null, null, null, {
    maxConcurrency: 3,
    getCreditStatus: () => ({ remaining: 100 }),
    apiCallFn: async (_endpoint, params) => {
      calls += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return historyResponse(params);
    },
  });

  await Promise.all([
    poller.forceUpdate(() => {}),
    poller.forceUpdate(() => {}),
  ]);

  assert.equal(prisma.activeFinds, 1);
  assert.equal(calls, vessels.length);
  assert.ok(maxInFlight >= 2, `expected parallel work, saw ${maxInFlight}`);
  assert.ok(maxInFlight <= 3, `concurrency exceeded bound: ${maxInFlight}`);
});

test("credit circuit breaker stops scheduling requests at configured reserve", async () => {
  const vessels = makeVessels(6);
  const prisma = makePrisma(vessels);
  let calls = 0;
  const poller = createDatalasticPoller(prisma, null, null, null, {
    maxConcurrency: 3,
    creditReserve: 0,
    getCreditStatus: () => ({ remaining: 2, checkedAt: "2026-07-15T00:00:00.000Z" }),
    apiCallFn: async (_endpoint, params) => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return historyResponse(params);
    },
  });

  await poller.forceUpdate(() => {});
  assert.equal(calls, 2);
});

test("delayed history older than persisted state cannot evaluate geofence or broadcast", async () => {
  const vessel = makeVessels(1)[0];
  const prisma = makePrisma([vessel], {
    latestPositions: {
      [vessel.id]: { lat: 35, lon: 129, timestamp: new Date(1_800_000_000_000) },
    },
  });
  const geofenceCalls = [];
  const broadcasts = [];
  const poller = createDatalasticPoller(
    prisma,
    (position) => broadcasts.push(position),
    null,
    () => assert.fail("stale history must not emit a zone transition"),
    {
      getCreditStatus: () => ({ remaining: 100 }),
      geofenceChecker: {
        async detectAndSave(...args) { geofenceCalls.push(args); return [{ type: "entry" }]; },
        getCurrentZones: () => ["stale-zone"],
      },
      apiCallFn: async () => ({
        data: {
          name: vessel.mmsi,
          mmsi: vessel.mmsi,
          positions: [{
            lat: "1.0",
            lon: "2.0",
            speed: "10",
            course: "90",
            last_position_epoch: 1_700_000_000,
          }],
        },
      }),
    },
  );

  await poller.forceUpdate(() => {});

  assert.equal(prisma.positions.length, 1, "historical point should still be persisted");
  assert.equal(geofenceCalls.length, 0);
  assert.equal(broadcasts.length, 0);
});

test("apiCall asks the shared budget before every retry attempt", async () => {
  let budget = 1;
  let fetches = 0;
  const result = await apiCall("vessel_history", { mmsi: "123" }, {
    apiKey: "test-key",
    maxAttempts: 3,
    retryDelayMs: 0,
    jitterFn: () => 0,
    sleepFn: async () => {},
    beforeAttempt: () => {
      if (budget <= 0) return false;
      budget -= 1;
      return true;
    },
    fetchFn: async () => {
      fetches += 1;
      return jsonResponse({ error: "retry" }, 503);
    },
  });

  assert.equal(fetches, 1);
  assert.equal(result.attempts, 1);
  assert.equal(result.error, "credit_reserve");
});

test("parallel workers pessimistically reserve retry capacity and refund unused attempts", async () => {
  const prisma = makePrisma(makeVessels(6));
  let active = 0;
  let peak = 0;
  let calls = 0;
  const maxAttemptsSeen = [];
  const poller = createDatalasticPoller(prisma, null, null, null, {
    creditReserve: 0,
    getCreditStatus: () => ({ remaining: 6, checkedAt: "static" }),
    maxConcurrency: 3,
    apiCallFn: async (_endpoint, _params, callOptions) => {
      calls += 1;
      active += 1;
      peak = Math.max(peak, active);
      maxAttemptsSeen.push(callOptions.maxAttempts);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { attempted: true, attempts: 1, response: historyResponse(), error: null };
    },
  });

  await poller.forceUpdate(() => {});

  assert.equal(calls, 6);
  assert.ok(peak <= 2, `peak=${peak}`);
  assert.ok(maxAttemptsSeen.every((value) => value >= 1 && value <= 3));
  assert.equal(prisma.usage.reduce((sum, item) => sum + item.credits, 0), 6);
});

test("unknown credit state disables retries while keeping request scheduling bounded", async () => {
  const prisma = makePrisma(makeVessels(4));
  const maxAttemptsSeen = [];
  const poller = createDatalasticPoller(prisma, null, null, null, {
    creditReserve: 0,
    getCreditStatus: () => ({ remaining: null }),
    maxConcurrency: 2,
    apiCallFn: async (_endpoint, params, callOptions) => {
      maxAttemptsSeen.push(callOptions.maxAttempts);
      return { attempted: true, attempts: 1, response: historyResponse(params), error: null };
    },
  });

  await poller.forceUpdate(() => {});

  assert.deepEqual(maxAttemptsSeen, [1, 1, 1, 1]);
  assert.equal(prisma.usage.length, 4);
});
