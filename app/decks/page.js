"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ProtectedPage } from "@/components/protected-page";
import { PageHeading, LoadingPanel, Message } from "@/components/ui";
import { apiRequest } from "@/lib/api-client";

function DecksContent() {
  const [decks, setDecks] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try { const result = await apiRequest("/api/decks"); setDecks(result?.data?.decks || []); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function createDeck(event) {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    try {
      const result = await apiRequest("/api/decks", { method: "POST", body: JSON.stringify({ deck_name: name.trim() }) });
      setName(""); setNotice("Deck created successfully."); await load();
      const deckId = result?.data?.deck?.deck_id;
      if (deckId) window.location.href = "/decks/" + deckId;
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <div className="container-page"><PageHeading title="Deck builder" description="Create decks and make sure each one follows the 16-card game rules." />
    <Message type="error">{error}</Message><Message>{notice}</Message>
    <form onSubmit={createDeck} className="panel mb-5 flex flex-col gap-3 sm:flex-row sm:items-end"><div className="field flex-1"><label htmlFor="deckName">New deck name</label><input id="deckName" className="input" required maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Windrunner deck" /></div><button className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create deck"}</button></form>
    {loading ? <LoadingPanel text="Loading your decks…" /> : decks.length === 0 ? <div className="panel py-10 text-center text-slate-500">No decks yet. Create your first deck above.</div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{decks.map(deck => <article key={deck.deck_id} className="panel"><div className="flex items-start justify-between gap-2"><h2 className="font-bold text-slate-800">{deck.deck_name}</h2><span className="badge">#{deck.deck_id}</span></div><p className="mt-2 text-sm text-slate-500">{deck.total_cards ?? 0} / 16 cards · {deck.distinct_cards ?? 0} distinct</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: Math.min(100, ((Number(deck.total_cards) || 0) / 16) * 100) + "%" }} /></div><Link href={"/decks/" + deck.deck_id} className="btn btn-primary mt-4 w-full">Open deck</Link></article>)}</div>}
  </div>;
}
export default function DecksPage() { return <ProtectedPage><DecksContent /></ProtectedPage>; }
