"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProtectedPage } from "@/components/protected-page";
import { PageHeading, StatCard, Message } from "@/components/ui";
import { apiRequest } from "@/lib/api-client";
import { useAuth } from "@/components/auth-provider";

function DashboardContent() {
  const { player: sessionPlayer } = useAuth();
  const [profile, setProfile] = useState(sessionPlayer);
  const [collection, setCollection] = useState(null);
  const [decks, setDecks] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      apiRequest("/api/players/profile"),
      apiRequest("/api/players/collection"),
      apiRequest("/api/decks"),
    ]).then(results => {
      if (!active) return;
      if (results[0].status === "fulfilled") setProfile(results[0].value?.data?.player || sessionPlayer);
      if (results[1].status === "fulfilled") setCollection(results[1].value?.data?.summary || null);
      if (results[2].status === "fulfilled") setDecks(results[2].value?.data?.decks || []);
      const failed = results.find(r => r.status === "rejected");
      if (failed) setError("Some dashboard information could not be loaded: " + failed.reason.message);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionPlayer]);

  return <div className="container-page">
    <PageHeading title={"Welcome, " + (profile?.username || "Player") + "!"} description="Your Stormlight TCG player dashboard." action={<Link href="/collection" className="btn btn-primary">View collection</Link>} />
    {error && <Message type="warning">{error}</Message>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Sphere balance" value={profile?.spheres ?? "—"} hint="In-game currency" />
      <StatCard label="Total cards" value={collection?.total_cards ?? (loading ? "…" : "—")} hint="Across your collection" />
      <StatCard label="Distinct card types" value={collection?.distinct_cards ?? (loading ? "…" : "—")} hint="Unique card definitions" />
      <StatCard label="Your decks" value={decks.length} hint="Created deck lists" />
    </div>
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <section className="panel"><h2 className="text-lg font-bold text-slate-800">Quick actions</h2><div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Link className="btn" href="/decks">Manage decks</Link><Link className="btn" href="/store">Visit pack store</Link><Link className="btn" href="/battle">Open battle arena</Link><Link className="btn" href="/profile">Edit profile</Link>
      </div></section>
      <section className="panel"><h2 className="text-lg font-bold text-slate-800">Project status</h2><p className="mt-2 text-sm leading-6 text-slate-600">Authentication, player profile, collection and deck-management screens are connected to the implemented API routes. Pack purchases, battles and match history require their backend endpoints before they can persist.</p></section>
    </div>
    <section className="panel mt-6"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-800">Recent decks</h2><Link href="/decks" className="text-sm font-semibold text-blue-700 underline">View all</Link></div>
      {loading ? <p className="mt-4 text-sm text-slate-500">Loading decks…</p> : decks.length === 0 ? <p className="mt-4 text-sm text-slate-500">You have not created a deck yet.</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{decks.slice(0, 3).map(deck => <Link key={deck.deck_id} href={"/decks/" + deck.deck_id} className="card-tile hover:border-blue-300"><h3>{deck.deck_name}</h3><p className="mt-1 text-sm text-slate-500">{deck.total_cards || 0} / 16 cards</p></Link>)}</div>}
    </section>
  </div>;
}

export default function DashboardPage() { return <ProtectedPage><DashboardContent /></ProtectedPage>; }
