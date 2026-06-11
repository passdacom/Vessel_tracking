import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import sharesRoutes from "../src/routes/shares.js";

function makePrisma(initialShares = []) {
  const rows = initialShares.map((row, idx) => ({
    id: idx + 1,
    token: row.token,
    label: row.label,
    vesselIds: JSON.stringify(row.vesselIds),
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
          createdAt: new Date("2026-04-20T00:00:00.000Z"),
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
      async findMany({ where }) {
        return where.id.in.map((id) => ({
          id,
          mmsi: String(100000000 + id),
          name: `Vessel ${id}`,
          alias: null,
          color: "#3b82f6",
          positions: [],
        }));
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
