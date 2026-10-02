import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDatabase>["db"];

export function createDatabase(url: string, options: { maxConnections?: number } = {}) {
  const client = postgres(url, { max: options.maxConnections ?? 10 });
  const db = drizzle(client, { schema, casing: "snake_case" });
  return { db, close: () => client.end() };
}

export function databaseUrlFromEnv(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env at the repository root.");
  }
  return url;
}
