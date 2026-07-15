import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import sharesRoutes from "../src/routes/shares.js";

function makePrisma(initialShares = [], initialVessels = [
  { id: 1, account: "kb" },
  { id: 2, account: "kb" },
  { id: 3, account: "kdgc" },
]) {
  const rows = initialShares.map((row, idx) => ({
    id: idx + 1,
    token: row.token,
    label: row.label,
    vesselIds: row.rawVesselIds ?? JSON.stringify(row.vesselIds),
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt ?? new Date("2026-04-20T00:00:00.000Z"),
    expiresAt: row.expiresAt ?? null,
  }));

  return {
    sharedView: {
      async findMany({ where, orderBy } = {}) {
        let result = rows;
        if (where?.createdBy !== undefined) {
          result = result.filter((row) => row.createdBy === where.createdBy);
        }
        if (orderBy?.createdAt === "desc") {
          result = [...result].sort((a, b) => b.createdAt - a.createdAt);
        }
        return result;
      },
      async create({ data }) {
        const row = {
          id: rows.length + 1,
          token: `generated-${rows.length + 1}`,
          label: data.label,
          vesselIds: data.vesselIds,
          createdBy: data.createdBy ?? null,
          createdAt: new Date(),
          expiresAt: data.expiresAt ?? null,
        };
        rows.push(row);
        return row;
      },
      async deleteMany({ where }) {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) {
          const row = rows[i];
          const tokenMatches = row.token === where.token;
          const ownerMatches = where.createdBy === undefined || row.createdBy === where.createdBy;
          if (tokenMatches && ownerMatches) rows.splice(i, 1);
        }
        return { count: before - rows.length };
      },
      async findUnique({ where }) {
        return rows.find((row) => row.token === where.token) || null;
      },
    },
    vessel: {
      async findMany({ where, include, select }) {
        let vessels = initialVessels.filter((vessel) => where.id.in.includes(vessel.id));
        if (where.account !== undefined) {
          vessels = vessels.filter((vessel) => vessel.account === where.account);
        }
        return vessels.map((vessel) => {
          if (select) return { id: vessel.id };
          const positions = include?.positions
            ? (vessel.positions || []).filter((position) =>
                position.timestamp >= include.positions.where.timestamp.gte &&
                position.suspicious === include.positions.where.suspicious
              )
            : [];
          return {
          ...vessel,
          mmsi: String(100000000 + vessel.id),
          name: `Vessel ${vessel.id}`,
          alias: null,
          color: "#3b82f6",
          positions,
        };
        });
      },
    },
    _rows: rows,
  };
}

async function withServer({ account = "kb", role = "user", prisma }, fn) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.account = account;
    req.accountRole = role;
    next();
  });
  app.use("/api/shares", sharesRoutes(prisma));
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address();
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test("user can create a share owned by their account", async () => {
  const prisma = makePrisma();

  await withServer({ account: "kb", role: "user", prisma }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Client view", vesselIds: [1, 2] }),
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.createdBy, "kb");
    assert.equal(prisma._rows[0].createdBy, "kb");
    assert.ok(new Date(body.expiresAt) > new Date(body.createdAt));
  });
});

async function postShare(baseUrl, body) {
  const response = await fetch(`${baseUrl}/api/shares`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

test("user share creation rejects all-foreign and mixed vessel ids atomically", async () => {
  const prisma = makePrisma();
  await withServer({ account: "kb", role: "user", prisma }, async (baseUrl) => {
    for (const vesselIds of [[3], [1, 3]]) {
      const { response } = await postShare(baseUrl, { label: "Foreign", vesselIds });
      assert.equal(response.status, 403);
    }
    assert.equal(prisma._rows.length, 0);
  });
});

test("share creation rejects duplicate and nonexistent vessel ids", async () => {
  const prisma = makePrisma();
  await withServer({ account: "kb", role: "user", prisma }, async (baseUrl) => {
    assert.equal((await postShare(baseUrl, { label: "Duplicate", vesselIds: [1, 1] })).response.status, 400);
    assert.equal((await postShare(baseUrl, { label: "Missing", vesselIds: [999] })).response.status, 403);
    assert.equal(prisma._rows.length, 0);
  });
});

test("admin can share existing vessels from multiple accounts but not nonexistent ids", async () => {
  const prisma = makePrisma();
  await withServer({ account: "admin", role: "admin", prisma }, async (baseUrl) => {
    assert.equal((await postShare(baseUrl, { label: "Fleet", vesselIds: [1, 3] })).response.status, 200);
    assert.equal((await postShare(baseUrl, { label: "Missing", vesselIds: [999] })).response.status, 400);
    assert.equal(prisma._rows.length, 1);
  });
});

test("share expiry is bounded", async () => {
  const prisma = makePrisma();
  await withServer({ account: "kb", role: "user", prisma }, async (baseUrl) => {
    for (const expiresInHours of [0, -1, 721, "later"]) {
      const { response } = await postShare(baseUrl, { label: "Expiry", vesselIds: [1], expiresInHours });
      assert.equal(response.status, 400);
    }
    const { response, body } = await postShare(baseUrl, {
      label: "One day",
      vesselIds: [1],
      expiresInHours: 24,
    });
    assert.equal(response.status, 200);
    const durationHours = (new Date(body.expiresAt) - new Date(body.createdAt)) / 3_600_000;
    assert.ok(durationHours > 23.9 && durationHours <= 24);
  });
});

test("user only sees shares created by their own account", async () => {
  const prisma = makePrisma([
    { token: "own", label: "Own", vesselIds: [1], createdBy: "kb" },
    { token: "other", label: "Other", vesselIds: [2], createdBy: "kdgc" },
    { token: "legacy", label: "Legacy", vesselIds: [3], createdBy: null },
  ]);

  await withServer({ account: "kb", role: "user", prisma }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/shares`);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(body.map((share) => share.token), ["own"]);
  });
});

test("admin sees every share including legacy shares", async () => {
  const prisma = makePrisma([
    { token: "own", label: "Own", vesselIds: [1], createdBy: "kb" },
    { token: "other", label: "Other", vesselIds: [2], createdBy: "kdgc" },
    { token: "legacy", label: "Legacy", vesselIds: [3], createdBy: null },
  ]);

  await withServer({ account: "admin", role: "admin", prisma }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/shares`);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(body.map((share) => share.token), ["own", "other", "legacy"]);
  });
});

test("user cannot delete another account share", async () => {
  const prisma = makePrisma([
    { token: "other", label: "Other", vesselIds: [2], createdBy: "kdgc" },
  ]);

  await withServer({ account: "kb", role: "user", prisma }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/shares/other`, { method: "DELETE" });
    const body = await res.json();

    assert.equal(res.status, 404);
    assert.equal(body.error, "Share not found");
    assert.equal(prisma._rows.length, 1);
  });
});

test("admin can delete any share", async () => {
  const prisma = makePrisma([
    { token: "other", label: "Other", vesselIds: [2], createdBy: "kdgc" },
  ]);

  await withServer({ account: "admin", role: "admin", prisma }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/shares/other`, { method: "DELETE" });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(prisma._rows.length, 0);
  });
});

test("public share view remains unauthenticated", async () => {
  const prisma = makePrisma([
    { token: "public-token", label: "Public", vesselIds: [1, 2], createdBy: "kb" },
  ]);

  const app = express();
  app.use(express.json());
  app.use("/api/shares", sharesRoutes(prisma));
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/shares/view/public-token?hours=72`);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.label, "Public");
    assert.equal(body.vessels.length, 2);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test("public user share filters foreign legacy ids, suspicious positions, and excessive hours", async () => {
  const now = new Date();
  const prisma = makePrisma([
    { token: "legacy-malformed", label: "Public", vesselIds: [1, 3], createdBy: "kb" },
  ], [
    {
      id: 1,
      account: "kb",
      positions: [
        { id: 1, timestamp: now, suspicious: false },
        { id: 2, timestamp: now, suspicious: true },
      ],
    },
    { id: 3, account: "kdgc", positions: [{ id: 3, timestamp: now, suspicious: false }] },
  ]);

  const app = express();
  app.use(express.json());
  app.use("/api/shares", sharesRoutes(prisma));
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/shares/view/legacy-malformed?hours=999999`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.vessels.map((vessel) => vessel.id), [1]);
    assert.deepEqual(body.vessels[0].positions.map((position) => position.id), [1]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("malformed legacy vesselIds are controlled on both list and public paths", async () => {
  const prisma = makePrisma([
    { token: "broken", label: "Broken", rawVesselIds: "{not-json", createdBy: null },
  ]);

  await withServer({ account: "admin", role: "admin", prisma }, async (baseUrl) => {
    const listResponse = await fetch(`${baseUrl}/api/shares`);
    const listBody = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.deepEqual(listBody[0].vesselIds, []);
    assert.equal(listBody[0].invalidData, true);

    const publicResponse = await fetch(`${baseUrl}/api/shares/view/broken`);
    assert.equal(publicResponse.status, 404);
    assert.deepEqual(await publicResponse.json(), { error: "Invalid or expired link" });
  });
});
