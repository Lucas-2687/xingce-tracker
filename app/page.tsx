import { cookies } from "next/headers";
import App from "../src/App";
import LoginForm from "./LoginForm";
import { configurationReady, sessionCookieName, verifySession } from "../server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Home() {
  if (!configurationReady()) return <main className="login-shell"><section className="login-card">
    <p className="eyebrow">行测轨迹</p><h1>即将准备就绪</h1>
    <p>请先完成网站的数据库和登录配置，再刷新页面。</p>
  </section></main>;
  const token = (await cookies()).get(sessionCookieName())?.value;
  const user = await verifySession(token);
  return user ? <App key={user.userId} userName={user.displayName} userId={user.userId} /> : <LoginForm />;
}
