"use client";

import { useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/protected-page";
import { PageHeading, LoadingPanel, Message } from "@/components/ui";
import { apiRequest } from "@/lib/api-client";

function CollectionContent() {
  const [cards, setCards] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("ALL");
  const [rarity, setRarity] = useState("ALL");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    apiRequest("/api/players/collection")
      .then(result => { setCards(result?.data?.collection || []); setSummary(result?.data?.summary || null); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => cards.filter(card => {
    const matchesSearch = (card.card_name || "").toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (type === "ALL" || card.card_type === type) && (rarity === "ALL" || card.rarity === rarity);
  }), [cards, search, type, rarity]);

  return <div className="container-page">
    <PageHeading title="Card collection" description="Your owned cards, including detailed information retrieved from MongoDB." />
    <div className="mb-4 grid gap-3 sm:grid-cols-3"><div className="panel"><span className="text-sm text-slate-500">Distinct cards</span><div className="stat-value mt-1">{summary?.distinct_cards ?? cards.length}</div></div><div className="panel"><span className="text-sm text-slate-500">Total copies</span><div className="stat-value mt-1">{summary?.total_cards ?? "—"}</div></div><div className="panel"><span className="text-sm text-slate-500">Filtered results</span><div className="stat-value mt-1">{filtered.length}</div></div></div>
    <Message type="error">{error}</Message>
    <div className="panel mb-4 grid gap-3 sm:grid-cols-3">
      <div className="field"><label htmlFor="search">Search by name</label><input id="search" className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search cards…" /></div>
      <div className="field"><label htmlFor="type">Card type</label><select id="type" className="input" value={type} onChange={e => setType(e.target.value)}><option value="ALL">All types</option><option value="CHARACTER">Character</option><option value="EVENT">Event</option><option value="HELPER">Helper</option></select></div>
      <div className="field"><label htmlFor="rarity">Rarity</label><select id="rarity" className="input" value={rarity} onChange={e => setRarity(e.target.value)}><option value="ALL">All rarities</option>{["COMMON","RARE","EPIC","LEGENDARY"].map(x => <option key={x}>{x}</option>)}</select></div>
    </div>
    {loading ? <LoadingPanel text="Loading your collection…" /> : filtered.length === 0 ? <div className="panel py-10 text-center text-slate-500">No cards match these filters.</div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{filtered.map(card => <button key={card.card_id} type="button" onClick={() => setSelected(card)} className="card-tile text-left transition hover:border-blue-300 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2"><span className="badge">{card.rarity}</span><span className="badge">Owned: {card.quantity}</span></div><h3 className="mt-3">{card.card_name}</h3><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{card.card_type} {card.character_type ? "· " + card.character_type : ""}</p><p className="mt-2 line-clamp-2 text-sm text-slate-600">{card.description || "No description available."}</p><p className="mt-3 text-xs font-semibold text-blue-700">View details →</p>
    </button>)}</div>}
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label="Card details" onClick={() => setSelected(null)}><div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><span className="badge">{selected.rarity}</span><h2 className="mt-2 text-2xl font-bold text-slate-800">{selected.card_name}</h2></div><button className="btn" onClick={() => setSelected(null)}>Close</button></div><p className="mt-3 text-sm text-slate-600">{selected.description}</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{[["Type", selected.card_type], ["Owned", selected.quantity], ["HP", selected.base_hp], ["Max Light", selected.max_light], ["Character type", selected.character_type], ["Weapon / Spren", selected.weapon_or_spren], ["Order", selected.order_name], ["Event/helper subtype", selected.event_helper_type]].filter(([,v]) => v !== null && v !== undefined && v !== "").map(([k,v]) => <div key={k} className="rounded-lg bg-slate-50 p-3 text-sm"><span className="text-slate-500">{k}: </span><strong>{v}</strong></div>)}</div>
      {selected.details && <div className="mt-5 space-y-3"><div><h3 className="font-bold">Lore</h3><p className="mt-1 text-sm text-slate-600">{selected.details.lore || "—"}</p></div><div><h3 className="font-bold">Flavour text</h3><p className="mt-1 text-sm text-slate-600">{selected.details.flavour_text || "—"}</p></div>{["moves","ideals","effects","special_rules"].map(key => <div key={key}><h3 className="font-bold capitalize">{key.replace("_", " ")}</h3><pre className="mt-1 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(selected.details[key] || [], null, 2)}</pre></div>)}</div>}
      {!selected.details && <Message type="warning">No MongoDB detail document was returned for this card. MySQL card information is still available.</Message>}
    </div></div>}
  </div>;
}

export default function CollectionPage() { return <ProtectedPage><CollectionContent /></ProtectedPage>; }
