import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

/**
 * DATABASE_URL picks the database:
 *   - unset / "file:data/watchtrail.db"  → a local SQLite file (default)
 *   - "libsql://<name>.turso.io"         → a hosted Turso database (set DATABASE_AUTH_TOKEN too)
 * The same code works for both, so deploying is just a matter of env vars.
 */
const url = process.env.DATABASE_URL || "file:data/watchtrail.db";

function makeClient(): Client {
  if (url.startsWith("file:")) {
    const filePath = url.slice("file:".length);
    mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  }
  return createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
}

const globalForDb = globalThis as unknown as {
  __wtClient?: Client;
  __wtReady?: Promise<void>;
};

const client = globalForDb.__wtClient ?? makeClient();
if (process.env.NODE_ENV !== "production") globalForDb.__wtClient = client;

export const db = drizzle(client, { schema });

async function init() {
  await client.execute("PRAGMA foreign_keys = ON");
  if (url.startsWith("file:")) await client.execute("PRAGMA journal_mode = WAL");
  await client.batch(schema.SCHEMA_SQL, "write");
}

/** Await before the first query in any request; creates tables on first run. */
export function ready(): Promise<void> {
  if (!globalForDb.__wtReady) {
    globalForDb.__wtReady = init().catch((err) => {
      globalForDb.__wtReady = undefined;
      throw err;
    });
  }
  return globalForDb.__wtReady;
}
