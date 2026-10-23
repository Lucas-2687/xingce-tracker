import { cookies } from "next/headers";
import { sessionCookieName } from "../../../../server/auth";
import { json, sameOrigin } from "../../../../server/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "origin_rejected" }, 403);
  (await cookies()).set(sessionCookieName(), "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return json({ ok: true });
}
