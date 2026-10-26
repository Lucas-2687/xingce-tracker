import "server-only";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { promisify } from "node:util";
import { SignJWT, jwtVerify } from "jose";

const derive = promisify(scrypt);
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const ownerId = () => process.env.APP_OWNER_ID || "owner";
export const sessionCookieName = () => process.env.NODE_ENV === "production" ? "__Host-xingce-session" : "xingce-session";
export const displayName = () => process.env.APP_DISPLAY_NAME || "我的行测轨迹";
export function configurationReady() {
  if (process.env.VERCEL_ENV === "preview" && process.env.APP_PREVIEW_ENABLED !== "true") return false;
  return Boolean(process.env.TURSO_DATABASE_URL && process.env.APP_PASSWORD_HASH?.match(/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/) && (process.env.APP_SESSION_SECRET?.length ?? 0) >= 32 && (process.env.TURSO_AUTH_TOKEN || process.env.NODE_ENV !== "production"));
}
function signingKey() {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Session configuration missing");
  return new TextEncoder().encode(secret);
}
function credentialVersion() { return createHash("sha256").update(process.env.APP_PASSWORD_HASH || "").digest("hex"); }
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await derive(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}
export async function verifyPassword(password: string) {
  const parts = process.env.APP_PASSWORD_HASH?.split(":");
  if (!parts || parts.length !== 3 || parts[0] !== "scrypt" || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{128}$/.test(parts[2])) return false;
  const actual = await derive(password, parts[1], 64) as Buffer;
  return timingSafeEqual(actual, Buffer.from(parts[2], "hex"));
}
export async function createSession() {
  return new SignJWT({ cv: credentialVersion() }).setProtectedHeader({ alg: "HS256" }).setSubject(ownerId()).setIssuer("xingce-tracker").setAudience("xingce-web").setIssuedAt().setExpirationTime(`${SESSION_SECONDS}s`).sign(signingKey());
}
export async function verifySession(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey(), { algorithms: ["HS256"], issuer: "xingce-tracker", audience: "xingce-web" });
    if (payload.sub !== ownerId() || payload.cv !== credentialVersion() || typeof payload.exp !== "number") return null;
    return { userId: ownerId(), displayName: displayName(), expiresAt: payload.exp * 1000 };
  } catch { return null; }
}
export function loginRateKey(request: Request) {
  // Only Vercel's ingress is trusted to replace this header. Other hosts share one limit.
  const forwarded = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.trim() : undefined;
  const ip = forwarded && isIP(forwarded) ? forwarded : "shared";
  return createHash("sha256").update(`${process.env.APP_SESSION_SECRET}:${ip}`).digest("hex");
}
