import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { SignJWT, jwtVerify } from "jose";

const derive = promisify(scrypt);
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const ownerId = () => process.env.APP_OWNER_ID || "owner";
export const sessionCookieName = () => process.env.NODE_ENV === "production" ? "__Host-xingce-session" : "xingce-session";
export const displayName = () => process.env.APP_DISPLAY_NAME || "我的行测轨迹";
export function configurationReady() {
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
    if (payload.sub !== ownerId() || payload.cv !== credentialVersion()) return null;
    return { userId: ownerId(), displayName: displayName() };
  } catch { return null; }
}
export function loginRateKey(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  return createHash("sha256").update(`${process.env.APP_SESSION_SECRET}:${ip}`).digest("hex");
}
