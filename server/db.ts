import { createClient } from "@libsql/client";
import { createStore } from "./store";
import { ownerId } from "./auth";

let store: ReturnType<typeof createStore> | undefined;
export function getStore() {
  if (!process.env.TURSO_DATABASE_URL) throw new Error("Database configuration missing");
  store ??= createStore(createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }), ownerId());
  return store;
}
