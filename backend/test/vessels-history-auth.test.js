import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import vesselRoutes from "../src/routes/vessels.js";

function makePrisma() {
  const admin = { name: "admin", password: "admin-secret", role: "admin" };
  return {
    account: {
      async findUnique({ where, select } = {}) {
        if (where?.name !== "admin") return null;
        if (select) {
          return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, admin[key]]));
        }
        return admin;
      },
      async update({ where, data }) {
        if (where?.name !== "admin") return null;
        Object.assign(admin, data);
        return admin;
      },
    },
    apiUsage: {
      async create() {
        return {};
      },
    },
    vessel: {
      async findUnique({ where }) {
        if (where?.id !== 1) return null;
        return {
          id: 1,
          account: "kb",
          name: "Password Test Vessel",
          mmsi: null,
          imo: null,
        };
      },
    },
  };
}

async function withServer({ account = "kb", role = "user", prisma = makePrisma() } = {}, fn) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.account = account;
    req.accountRole = role;
    next();
  });
  app.use("/api/vessels", vesselRoutes(prisma));
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address();
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test("non-admin history fetch requires an admin password", async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/vessels/1/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: 7 }),
    });
    const body = await res.json();

    assert.equal(res.status, 401);
    assert.equal(body.error, "히스토리 조회 비밀번호를 입력해주세요.");
  });
});

test("non-admin history fetch rejects the wrong admin password", async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/vessels/1/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: 7, password: "wrong" }),
    });
    const body = await res.json();

    assert.equal(res.status, 401);
    assert.equal(body.error, "히스토리 조회 비밀번호가 올바르지 않습니다.");
  });
});

test("non-admin history fetch accepts the admin password before continuing", async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/vessels/1/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: 7, password: "admin-secret" }),
    });
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.equal(body.error, "선박의 IMO 또는 MMSI가 필요합니다");
  });
});

test("admin history fetch can continue without re-entering a password", async () => {
  await withServer({ account: "admin", role: "admin" }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/vessels/1/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: 7 }),
    });
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.equal(body.error, "선박의 IMO 또는 MMSI가 필요합니다");
  });
});
