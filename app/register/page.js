"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { Message } from "@/components/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: "", email: "", password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function change(key, value) { setForm(current => ({ ...current, [key]: value })); }

  async function submit(event) {
    event.preventDefault(); setError("");
    if (form.password !== form.confirmPassword) { setError("Passwords do not match."); return; }
    if (form.password.length < 8) { setError("Password must contain at least 8 characters."); return; }
    setBusy(true);
    try {
      await apiRequest("/api/auth/register", { method: "POST", body: JSON.stringify({ username: form.username.trim(), email: form.email.trim(), password: form.password }) });
      router.push("/login?registered=1");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <div className="container-page max-w-lg"><div className="panel">
    <h1 className="page-title">Create your account</h1><p className="page-subtitle mb-6">New players receive a starter collection after registration.</p>
    <Message type="error">{error}</Message>
    <form onSubmit={submit} className="mt-4 grid gap-4">
      <div className="field"><label htmlFor="username">Username</label><input id="username" className="input" autoComplete="username" minLength={3} maxLength={50} required value={form.username} onChange={e => change("username", e.target.value)} /></div>
      <div className="field"><label htmlFor="email">Email</label><input id="email" className="input" type="email" autoComplete="email" maxLength={100} required value={form.email} onChange={e => change("email", e.target.value)} /></div>
      <div className="field"><label htmlFor="password">Password (minimum 8 characters)</label><input id="password" className="input" type="password" autoComplete="new-password" minLength={8} required value={form.password} onChange={e => change("password", e.target.value)} /></div>
      <div className="field"><label htmlFor="confirmPassword">Confirm password</label><input id="confirmPassword" className="input" type="password" autoComplete="new-password" minLength={8} required value={form.confirmPassword} onChange={e => change("confirmPassword", e.target.value)} /></div>
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Creating account…" : "Register"}</button>
    </form>
    <p className="mt-5 text-sm text-slate-600">Already registered? <Link className="font-semibold text-blue-700 underline" href="/login">Log in</Link></p>
  </div></div>;
}
