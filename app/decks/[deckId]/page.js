"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ProtectedPage } from "@/components/protected-page";
import { PageHeading, LoadingPanel, Message } from "@/components/ui";
import { apiRequest } from "@/lib/api-client";

function DeckDetailContent() {
  const params = useParams();
  const deckId = params.deckId;
  const [deck, setDeck] = useState(null);
  const [ownedCards, setOwnedCards] = useState([]);
  const [cardId, setCardId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [validation, setValidation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [deckResult, collectionResult] = await Promise.all([
        apiRequest("/api/decks/" + deckId),
        apiRequest("/api/players/collection"),
      ]);
      setDeck(deckResult?.data?.deck || null);
      setOwnedCards(collectionResult?.data?.collection || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [deckId]);
  useEffect(() => { load(); }, [load]);

  async function addCard(event) {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    try {
      await apiRequest("/api/decks/" + deckId + "/cards", { method: "POST", body: JSON.stringify({ card_id: Number(cardId), quantity: Number(quantity) }) });
      setNotice("Card added to deck."); await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function removeCard(id, currentQuantity) {
    const raw = window.prompt("How many copies should be removed?", "1");
    if (raw === null) return;
    const amount = Number(raw);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > currentQuantity) { setError("Enter a valid quantity no greater than the copies in this deck."); return; }
    setError(""); setNotice(""); setBusy(true);
    try { await apiRequest("/api/decks/" + deckId + "/cards/" + id, { method: "DELETE", body: JSON.stringify({ quantity: amount }) }); setNotice("Card removed from deck."); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function validateDeck() {
    setError(""); setValidation(null); setBusy(true);
    try { const result = await apiRequest("/api/decks/" + deckId + "/validate"); setValidation(result?.data || result); setNotice("Deck validation completed."); }
    catch (err) { setError(err.message); setValidation({ validation_status: "INVALID", message: err.message }); }
    finally { setBusy(false); }
  }

  async function renameDeck() {
    const nextName = window.prompt("Enter a new deck name:", deck?.deck_name || "");
    if (nextName === null) return;
    if (!nextName.trim()) { setError("Deck name cannot be empty."); return; }
    setBusy(true); setError("");
    try { await apiRequest("/api/decks/" + deckId, { method: "PUT", body: JSON.stringify({ deck_name: nextName.trim() }) }); await load(); setNotice("Deck renamed."); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function deleteDeck() {
    if (!window.confirm("Delete this deck? This cannot be undone.")) return;
    setBusy(true); setError("");
    try { await apiRequest("/api/decks/" + deckId, { method: "DELETE" }); window.location.href = "/decks"; }
    catch (err) { setError(err.message); setBusy(false); }
  }

  const cards = deck?.cards || [];
  const total = Number(deck?.total_cards ?? cards.reduce((n,c) => n + Number(c.quantity || 0), 0));
  const characters = cards.reduce((n,c) => n + (c.card_type === "CHARACTER" ? Number(c.quantity || 0) : 0), 0);
  const nonCharacters = total - characters;
  const eligible = ownedCards.filter(card => Number(card.quantity || 0) > 0);

  return <div className="container-page">
    <PageHeading title={deck?.deck_name || "Deck details"} description="A legal deck contains exactly 3 unique characters and 13 Event/Helper cards." action={<Link href="/decks" className="btn">← All decks</Link>} />
    {loading ? <LoadingPanel text="Loading deck…" /> : <>
      <Message type="error">{error}</Message><Message>{notice}</Message>
      <div className="mb-5 grid gap-3 sm:grid-cols-3"><div className="panel"><p className="text-sm text-slate-500">Total cards</p><p className="stat-value">{total} / 16</p></div><div className="panel"><p className="text-sm text-slate-500">Characters</p><p className="stat-value">{characters} / 3</p></div><div className="panel"><p className="text-sm text-slate-500">Event / Helper</p><p className="stat-value">{nonCharacters} / 13</p></div></div>
      <div className="panel mb-5 flex flex-wrap gap-2"><button className="btn" onClick={renameDeck} disabled={busy}>Rename deck</button><button className="btn btn-danger" onClick={deleteDeck} disabled={busy}>Delete deck</button><button className="btn btn-primary" onClick={validateDeck} disabled={busy}>{busy ? "Working…" : "Validate deck"}</button></div>
      {validation && <Message type={validation.validation_status === "INVALID" ? "warning" : "info"}>{validation.message || (validation.validation_status === "VALID" ? "Deck is valid and ready for a match." : "Deck validation returned a result.")}</Message>}
      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <section className="panel"><h2 className="text-lg font-bold text-slate-800">Cards in this deck</h2>{cards.length === 0 ? <p className="mt-4 text-sm text-slate-500">This deck is empty. Add cards from your collection.</p> : <div className="mt-3 space-y-2">{cards.map(card => <div key={card.card_id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-800">{card.card_name}</p><p className="text-xs text-slate-500">{card.card_type} · {card.rarity} · Qty {card.quantity}</p></div><button className="btn btn-danger" disabled={busy} onClick={() => removeCard(card.card_id, Number(card.quantity))}>Remove</button></div>)}</div>}</section>
        <section className="panel"><h2 className="text-lg font-bold text-slate-800">Add from your collection</h2><form onSubmit={addCard} className="mt-4 grid gap-3"><div className="field"><label htmlFor="ownedCard">Owned card</label><select id="ownedCard" className="input" required value={cardId} onChange={e => setCardId(e.target.value)}><option value="">Select a card</option>{eligible.map(card => <option key={card.card_id} value={card.card_id}>{card.card_name} ({card.card_type}) · owned {card.quantity}</option>)}</select></div><div className="field"><label htmlFor="quantity">Quantity</label><input id="quantity" className="input" type="number" min="1" max="3" value={quantity} onChange={e => setQuantity(e.target.value)} /></div><button className="btn btn-primary" disabled={busy || !cardId}>{busy ? "Saving…" : "Add card"}</button></form><p className="mt-3 text-xs leading-5 text-slate-500">The backend checks card ownership and the three-copy limit. Use Validate deck when the composition is complete.</p></section>
      </div>
    </>}
  </div>;
}
export default function DeckDetailPage() { return <ProtectedPage><DeckDetailContent /></ProtectedPage>; }
