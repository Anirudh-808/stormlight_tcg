"use client";

import { useState } from "react";
import { ProtectedPage } from "@/components/protected-page";
import { PageHeading, Message } from "@/components/ui";

const demoCards = ["Kaladin Stormblessed", "Shallan Davar", "Dalinar Kholin", "The Stormfather", "Herald of War", "Hoid", "Highstorm", "Everstorm"];

function StoreContent() {
  const [revealed, setRevealed] = useState(null);
  function previewPack() {
    const cards = Array.from({ length: 5 }, () => demoCards[Math.floor(Math.random() * demoCards.length)]);
    setRevealed(cards);
  }
  return <div className="container-page"><PageHeading title="Pack store" description="Packs contain five cards and have a listed cost of 500 Spheres." />
    <Message type="warning">Demo mode: the backend branch does not yet include pack-list or pack-purchase endpoints. This preview does not deduct Spheres or save cards to MySQL.</Message>
    <div className="mt-5 grid gap-5 md:grid-cols-[.8fr_1.2fr]"><section className="panel"><span className="badge">Starter pack</span><h2 className="mt-3 text-2xl font-black text-slate-800">5-card pack</h2><p className="mt-2 text-sm leading-6 text-slate-600">Open a local preview to see how the pack reveal interaction will work. Actual random selection and collection updates will be connected when the backend purchase API is available.</p><div className="my-5 text-3xl font-black text-[#315a83]">500 <span className="text-base font-semibold">Spheres</span></div><button className="btn btn-primary w-full" onClick={previewPack}>Preview a pack (demo)</button></section>
    <section className="panel"><h2 className="text-lg font-bold text-slate-800">Pack contents</h2>{revealed ? <><p className="mt-1 text-sm text-slate-500">Five sample card names selected locally for this preview:</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{revealed.map((name,index) => <div key={index} className="card-tile"><span className="badge">Card {index + 1}</span><h3 className="mt-2">{name}</h3></div>)}</div><button className="btn mt-4" onClick={() => setRevealed(null)}>Close preview</button></> : <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">Your five revealed cards will appear here.</div>}</section></div>
  </div>;
}
export default function StorePage() { return <ProtectedPage><StoreContent /></ProtectedPage>; }
