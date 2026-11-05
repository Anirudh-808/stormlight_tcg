"use client";

import { useEffect, useState } from "react";
import { ProtectedPage } from "@/components/protected-page";
import { PageHeading, LoadingPanel, Message } from "@/components/ui";
import { apiRequest } from "@/lib/api-client";
import { useAuth } from "@/components/auth-provider";

function ProfileContent() {
  const { refresh } = useAuth();
  const [player, setPlayer] = useState(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { apiRequest("/api/players/profile").then(r => { const p = r?.data?.player; setPlayer(p); setUsername(p?.username || ""); setEmail(p?.email || ""); }).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);

  async function submit(event) {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    const body = { username: username.trim(), email: email.trim() };
    if (newPassword) { body.currentPassword = currentPassword; body.newPassword = newPassword; }
    try { const result = await apiRequest("/api/players/profile", { method: "PUT", body: JSON.stringify(body) }); setPlayer(result?.data?.player || player); setNotice("Profile updated successfully."); setCurrentPassword(""); setNewPassword(""); await refresh(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return <div className="container-page max-w-3xl"><PageHeading title="Player profile" description="View and update your account information." />{error && <Message type="error">{error}</Message>}{notice && <Message>{notice}</Message>}{loading ? <LoadingPanel /> : <div className="panel"><div className="mb-5 grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-slate-500">Player ID</p><strong>{player?.player_id}</strong></div><div><p className="text-xs text-slate-500">Role</p><strong>{player?.role || "PLAYER"}</strong></div><div><p className="text-xs text-slate-500">Spheres</p><strong>{player?.spheres ?? 0}</strong></div></div><form onSubmit={submit} className="grid gap-4"><div className="field"><label htmlFor="username">Username</label><input id="username" className="input" minLength={1} maxLength={50} required value={username} onChange={e => setUsername(e.target.value)} /></div><div className="field"><label htmlFor="email">Email</label><input id="email" className="input" type="email" maxLength={100} required value={email} onChange={e => setEmail(e.target.value)} /></div><hr className="border-slate-200" /><p className="text-sm font-semibold text-slate-700">Change password (optional)</p><div className="field"><label htmlFor="currentPassword">Current password</label><input id="currentPassword" className="input" type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /></div><div className="field"><label htmlFor="newPassword">New password</label><input id="newPassword" className="input" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div><button className="btn btn-primary justify-self-start" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></form></div>}</div>;
}
export default function ProfilePage() { return <ProtectedPage><ProfileContent /></ProtectedPage>; }
