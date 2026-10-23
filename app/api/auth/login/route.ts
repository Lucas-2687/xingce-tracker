import { cookies } from "next/headers";
import { configurationReady, createSession, loginRateKey, sessionCookieName, SESSION_SECONDS, verifyPassword } from "../../../../server/auth";
import { getStore } from "../../../../server/db";
import { json, readJson, sameOrigin } from "../../../../server/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "origin_rejected" }, 403);
  if (!configurationReady()) return json({ error: "configuration_required" }, 503);
  try {
    const body = await readJson(request, 2048) as { password?: unknown };
    if (typeof body?.password !== "string" || !body.password || body.password.length > 256) return json({ error: "invalid_data" }, 400);
    if (!await getStore().allowLogin(loginRateKey(request))) return json({ error: "too_many_attempts" }, 429, { "retry-after": "900" });
    if (!await verifyPassword(body.password)) return json({ error: "invalid_credentials" }, 401);
    (await cookies()).set(sessionCookieName(), await createSession(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: SESSION_SECONDS });
    return json({ ok: true });
  } catch { return json({ error: "login_unavailable" }, 503); }
}
