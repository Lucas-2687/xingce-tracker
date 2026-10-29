import type { Client } from "@libsql/client";
import type { TrackerData } from "../src/types";
import { normalizeSimulationSources, withSimulationSources } from "../src/lib/simulation";

export type StoredData = TrackerData;
export function createStore(client: Client, userId: string) {
  let initialization: Promise<void> | undefined;
  async function initialize() {
    initialization ??= (async () => {
      await client.batch([
        "CREATE TABLE IF NOT EXISTS xingce_user_data (user_id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS xingce_login_limits (key TEXT PRIMARY KEY NOT NULL, attempts INTEGER NOT NULL, window_start INTEGER NOT NULL)",
        { sql: "INSERT INTO xingce_user_data(user_id,payload,revision,updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(user_id) DO NOTHING", args: [userId, JSON.stringify({ records: [], practiceRecords: [] }), new Date().toISOString()] },
      ], "write");
    })().catch(error => { initialization = undefined; throw error; });
    return initialization;
  }
  return {
    async read() {
      await initialize();
      const result = await client.execute({ sql: "SELECT payload, revision FROM xingce_user_data WHERE user_id = ?", args: [userId] });
      const row = result.rows[0];
      if (!row) throw new Error("Data row unavailable");
      const data = JSON.parse(String(row.payload)) as StoredData;
      if (!Array.isArray(data.records) || !Array.isArray(data.practiceRecords)) throw new Error("Stored data invalid");
      return { ...withSimulationSources(data), revision: Number(row.revision) };
    },
    async write(revision: number, data: StoredData) {
      await initialize();
      let sources = data.simulationSources;
      if (sources === undefined) {
        const current = await client.execute({
          sql: "SELECT payload FROM xingce_user_data WHERE user_id = ? AND revision = ?",
          args: [userId, revision],
        });
        if (!current.rows[0]) return null;
        sources = normalizeSimulationSources(JSON.parse(String(current.rows[0].payload)).simulationSources);
      }
      const result = await client.execute({
        sql: "UPDATE xingce_user_data SET payload = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ?",
        args: [JSON.stringify({ ...data, simulationSources: normalizeSimulationSources(sources) }), new Date().toISOString(), userId, revision],
      });
      return result.rowsAffected === 1 ? revision + 1 : null;
    },
    async allowLogin(key: string, now = Date.now()) {
      await initialize();
      const cutoff = now - 15 * 60 * 1000;
      const result = await client.execute({
        sql: `INSERT INTO xingce_login_limits(key,attempts,window_start) VALUES (?,1,?)
          ON CONFLICT(key) DO UPDATE SET
            attempts = CASE WHEN window_start <= ? THEN 1 ELSE attempts + 1 END,
            window_start = CASE WHEN window_start <= ? THEN excluded.window_start ELSE window_start END
          RETURNING attempts`,
        args: [key, now, cutoff, cutoff],
      });
      await client.execute({ sql: "DELETE FROM xingce_login_limits WHERE window_start < ?", args: [now - 24 * 60 * 60 * 1000] });
      return Number(result.rows[0]?.attempts) <= 10;
    },
  };
}
