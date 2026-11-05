"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { useAuth } from "@/components/auth-provider";
import { Message } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      await apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify({ username: username.trim(), password }) });
      await refresh();
      router.replace("/dashboard");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <div className="container-page max-w-lg"><div className="panel">
    <h1 className="page-title">Welcome back</h1><p className="page-subtitle mb-6">Log in to continue to your collection and decks.</p>
    <Message type="error">{error}</Message>
    <form onSubmit={submit} className="mt-4 grid gap-4">
      <div className="field"><label htmlFor="username">Username</label><input id="username" className="input" autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)} /></div>
      <div className="field"><label htmlFor="password">Password</label><input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></div>
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : "Log in"}</button>
    </form>
    <p className="mt-5 text-sm text-slate-600">New to the game? <Link className="font-semibold text-blue-700 underline" href="/register">Create an account</Link></p>
  </div></div>;
}
