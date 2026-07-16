import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import adminRoutes from "../src/routes/admin.js";
import {
  authenticate,
  authenticateCredentials,
  clearAccountCache,
} from "../src/accounts.js";
import * as sessionStore from "../src/sessions.js";
import {
  hashPassword,
  isPasswordHash,
  verifyPassword,
} from "../src/passwords.js";
import { createSession, invalidateAccount } from "../src/sessions.js";
import { migratePasswordHashes } from "../scripts/migrate-password-hashes.mjs";

function makeAccountsPrisma(initialAccounts) {
  const rows = initialAccounts.map((row, index) => ({
    id: index + 1,
    role: "user",
    vesselLimit: 100,
    createdAt: new Date(),
    ...row,
  }));
  const writes = [];
  return {
    account: {
      async findMany() {
        return rows;
      },
      async findUnique({ where }) {
        return rows.find((row) => row.name === where.name) || null;
      },
      async create({ data, select }) {
        const row = { id: rows.length + 1, role: "user", createdAt: new Date(), ...data };
        rows.push(row);
        writes.push({ type: "create", data });
        return select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : row;
      },
      async update({ where, data }) {
        const row = rows.find((item) => item.name === where.name);
        if (!row) throw Object.assign(new Error("missing"), { code: "P2025" });
        Object.assign(row, data);
        writes.push({ type: "update", name: where.name, data });
        return row;
      },
      async delete({ where }) {
        const index = rows.findIndex((item) => item.name === where.name);
        if (index < 0) throw Object.assign(new Error("missing"), { code: "P2025" });
        return rows.splice(index, 1)[0];
      },
    },
    vessel: {
      async count() { return 0; },
    },
    _rows: rows,
    _writes: writes,
  };
}

async function withAdminServer(prisma, wsServer, fn) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.account = "admin";
    req.accountRole = "admin";
    next();
  });
  app.locals.wsServer = wsServer;
  app.use("/api/admin", adminRoutes(prisma));
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("scrypt password hashes are versioned and verifiable", async () => {
  const encoded = await hashPassword("correct horse battery staple");
  assert.equal(isPasswordHash(encoded), true);
  assert.equal(encoded.startsWith("scrypt$16384$8$1$"), true);
  assert.equal(await verifyPassword("correct horse battery staple", encoded), true);
  assert.equal(await verifyPassword("wrong password", encoded), false);
});

test("duplicate legacy passwords authenticate only the explicitly named account", async () => {
  const prisma = makeAccountsPrisma([
    { name: "tenant-a", password: "shared-password" },
    { name: "tenant-b", password: "shared-password" },
  ]);

  assert.equal((await authenticateCredentials(prisma, "tenant-a", "shared-password")).name, "tenant-a");
  assert.equal((await authenticateCredentials(prisma, "tenant-b", "shared-password")).name, "tenant-b");
  assert.equal(await authenticateCredentials(prisma, "missing", "shared-password"), null);
  assert.equal(await authenticateCredentials(prisma, "tenant-a", "wrong-password"), null);
  assert.equal(prisma._writes.filter((write) => write.type === "update").length, 2);
  assert.equal(prisma._rows.every((row) => isPasswordHash(row.password)), true);
});

test("failed legacy login does not mutate and successful login upgrades only that account", async () => {
  const prisma = makeAccountsPrisma([{ name: "legacy", password: "legacy-password" }]);
  assert.equal(await authenticateCredentials(prisma, "legacy", "wrong-password"), null);
  assert.equal(prisma._writes.length, 0);
  assert.equal((await authenticateCredentials(prisma, "legacy", "legacy-password")).name, "legacy");
  assert.equal(prisma._writes.length, 1);
  assert.equal(isPasswordHash(prisma._rows[0].password), true);
});

test("password bearer is rejected while a session token authenticates", async () => {
  const prisma = makeAccountsPrisma([{ name: "tenant-a", password: "plain-password" }]);
  assert.equal(await authenticate(prisma, "plain-password"), null);
  const token = createSession("tenant-a", "user");
  assert.deepEqual(await authenticate(prisma, token), { name: "tenant-a", role: "user" });
  invalidateAccount("tenant-a");
  assert.equal(await authenticate(prisma, token), null);
});

test("session details expose expiry without changing the normal auth principal", async () => {
  const token = createSession("tenant-expiry", "user", { ttlMs: 1_000 });

  try {
    const details = sessionStore.getSessionDetails(token);
    assert.deepEqual(Object.keys(details).sort(), ["expiresAt", "name", "role"]);
    assert.equal(details.name, "tenant-expiry");
    assert.equal(details.role, "user");
    assert.ok(details.expiresAt > Date.now());
    assert.deepEqual(await authenticate({}, token), { name: "tenant-expiry", role: "user" });
  } finally {
    invalidateAccount("tenant-expiry");
  }
});

test("admin account create and password update persist hashes, then deletion revokes sessions and WS", async () => {
  const prisma = makeAccountsPrisma([]);
  const disconnected = [];
  const wsServer = { disconnectAccount(name) { disconnected.push(name); } };

  await withAdminServer(prisma, wsServer, async (baseUrl) => {
    const createResponse = await fetch(`${baseUrl}/api/admin/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "tenant_a", password: "long-enough-password", vesselLimit: 10 }),
    });
    assert.equal(createResponse.status, 201);
    assert.equal(isPasswordHash(prisma._rows[0].password), true);

    const token = createSession("tenant_a", "user");
    const updateResponse = await fetch(`${baseUrl}/api/admin/accounts/tenant_a/password`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "another-long-password" }),
    });
    assert.equal(updateResponse.status, 200);
    assert.equal(isPasswordHash(prisma._rows[0].password), true);
    assert.equal(await authenticate(prisma, token), null);
    assert.deepEqual(disconnected, ["tenant_a"]);

    const tokenAfterChange = createSession("tenant_a", "user");
    const deleteResponse = await fetch(`${baseUrl}/api/admin/accounts/tenant_a`, { method: "DELETE" });
    assert.equal(deleteResponse.status, 200);
    assert.equal(await authenticate(prisma, tokenAfterChange), null);
    assert.deepEqual(disconnected, ["tenant_a", "tenant_a"]);
  });
  clearAccountCache();
});

test("password hash migration is dry-run by default and writes only with apply", async () => {
  const alreadyHashed = await hashPassword("already-hashed-password");
  const dryPrisma = makeAccountsPrisma([
    { name: "legacy", password: "legacy-password" },
    { name: "current", password: alreadyHashed },
  ]);
  const dryResult = await migratePasswordHashes({ prisma: dryPrisma, apply: false });
  assert.deepEqual(dryResult, { scanned: 2, pending: 1, updated: 0 });
  assert.equal(dryPrisma._writes.length, 0);

  const applyResult = await migratePasswordHashes({ prisma: dryPrisma, apply: true });
  assert.deepEqual(applyResult, { scanned: 2, pending: 1, updated: 1 });
  assert.equal(isPasswordHash(dryPrisma._rows[0].password), true);
});
