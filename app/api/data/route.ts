import { cookies } from "next/headers";
import { configurationReady, sessionCookieName, verifySession } from "../../../server/auth";
import { getStore } from "../../../server/db";
import { json, readJson, sameOrigin } from "../../../server/http";
import { validateData } from "../../../server/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
async function currentUser() { return verifySession((await cookies()).get(sessionCookieName())?.value); }
export async function GET() {
  if (!configurationReady()) return json({ error: "configuration_required" }, 503);
  if (!await currentUser()) return json({ error: "sign_in_required" }, 401);
  try { return json(await getStore().read()); }
  catch { return json({ error: "database_unavailable" }, 503); }
}
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return json({ error: "origin_rejected" }, 403);
  if (!configurationReady()) return json({ error: "configuration_required" }, 503);
  if (!await currentUser()) return json({ error: "sign_in_required" }, 401);
  let body;
  try { body = validateData(await readJson(request, 2 * 1024 * 1024)); }
  catch (error) { return json({ error: error instanceof Error && error.message === "payload_too_large" ? "payload_too_large" : "invalid_data" }, error instanceof Error && error.message === "payload_too_large" ? 413 : 400); }
  try {
    const revision = await getStore().write(body.revision, { records: body.records, practiceRecords: body.practiceRecords, simulationSources: body.simulationSources });
    return revision === null ? json({ error: "revision_conflict" }, 409) : json({ revision });
  } catch { return json({ error: "database_unavailable" }, 503); }
}
