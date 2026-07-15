#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { hashPassword, isPasswordHash } from "../src/passwords.js";

export async function migratePasswordHashes({ prisma, apply = false }) {
  const accounts = await prisma.account.findMany();
  const pending = accounts.filter((account) => !isPasswordHash(account.password));
  let updated = 0;

  if (apply) {
    for (const account of pending) {
      const password = await hashPassword(account.password);
      await prisma.account.update({ where: { name: account.name }, data: { password } });
      updated += 1;
    }
  }

  return { scanned: accounts.length, pending: pending.length, updated };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--apply");
  if (unknown.length > 0) throw new Error(`Unknown argument: ${unknown.join(", ")}`);

  const prisma = new PrismaClient();
  try {
    const result = await migratePasswordHashes({ prisma, apply });
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...result }));
    if (!apply && result.pending > 0) {
      console.log("Dry-run only. Re-run with --apply after backup and Human Gate approval.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
