import Link from "next/link";

export default function HomePage() {
  return (
    <div className="container-page">
      <section className="grid gap-8 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm md:grid-cols-[1.3fr_.7fr] md:items-center md:p-12">
        <div>
          <span className="badge">A turn-based trading card game</span>
          <h1 className="mt-5 max-w-2xl text-4xl font-black leading-tight tracking-tight text-[#1d3550] sm:text-5xl">Build your deck. <span className="text-[#527da5]">Choose your path.</span></h1>
          <p className="mt-5 max-w-xl leading-7 text-slate-600">Collect Radiants, Shardbearers, Heralds and powerful events. Build a 16-card deck and challenge a scripted computer opponent.</p>
          <div className="mt-7 flex flex-wrap gap-3"><Link href="/register" className="btn btn-primary">Create an account</Link><Link href="/login" className="btn">Already registered? Log in</Link></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[["16","Cards per deck"],["3","Characters"],["13","Event / Helper cards"],["500","Spheres per pack"]].map(([value,label]) => <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-5"><div className="text-3xl font-black text-[#315a83]">{value}</div><div className="mt-1 text-sm text-slate-600">{label}</div></div>)}
        </div>
      </section>
      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {[["Collect cards","Browse your collection and inspect each card’s character statistics and flexible details."],["Build a deck","Create a legal deck with exactly three unique characters and thirteen Event/Helper cards."],["Enter the arena","Play a turn-based match against a scripted computer opponent."]].map(([title,description]) => <article className="panel" key={title}><h2 className="text-lg font-bold text-slate-800">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></article>)}
      </section>
      <p className="mt-8 text-center text-xs text-slate-500">Academic project demonstration. Modules without backend APIs are identified as demo-only.</p>
    </div>
  );
}
