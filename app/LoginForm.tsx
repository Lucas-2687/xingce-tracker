"use client";

import { useState, type FormEvent } from "react";
import { notifySessionChange } from "../src/lib/storage";

export default function LoginForm({ notice }: { notice?: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError("");
    try {
      const password = String(new FormData(form).get("password") ?? "");
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }), signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) { form.reset(); notifySessionChange(); window.location.replace("/"); return; }
      setError(response.status === 429 ? "尝试次数较多，请 15 分钟后再试。" : response.status === 401 ? "密码不正确，请重新输入。" : "暂时无法登录，请稍后再试。");
    } catch { setError("连接失败，请检查网络后重试。"); }
    setBusy(false);
  }
  return <main className="login-shell"><section className="login-card">
    <p className="eyebrow">行测轨迹 · Score atlas</p>
    <h1>每一次练习，<br />都有迹可循。</h1>
    {notice ? <p role="status">{notice}</p> : <p>登录后继续记录成绩，查看你的进步。</p>}
    <form onSubmit={login}>
      <label htmlFor="password">访问密码</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256} autoFocus />
      {error && <p role="alert" className="login-error">{error}</p>}
      <button className="button button--primary" type="submit" disabled={busy}>{busy ? "正在登录…" : "进入我的轨迹"}</button>
    </form>
  </section></main>;
}
