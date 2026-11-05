"use client";

import { useState } from "react";
import { ProtectedPage } from "@/components/protected-page";
import { PageHeading, Message } from "@/components/ui";

const initialTeam = [{ name: "Kaladin Stormblessed", hp: 100, light: 100 }, { name: "Shallan Davar", hp: 90, light: 100 }, { name: "Dalinar Kholin", hp: 120, light: 100 }];
function BattleContent() {
  const [team, setTeam] = useState(initialTeam);
  const [enemyHp, setEnemyHp] = useState(120);
  const [turn, setTurn] = useState(1);
  const [log, setLog] = useState(["Battle demo ready. Select an action to begin."]);
  const [finished, setFinished] = useState(false);

  function attack() {
    if (finished) return;
    const next = Math.max(0, enemyHp - 20); setEnemyHp(next);
    setLog(current => ["Your active character dealt 20 damage.", ...current].slice(0, 8));
    if (next === 0) { setFinished(true); setLog(current => ["Demo victory! The opposing character was defeated.", ...current].slice(0, 8)); }
  }
  function special() {
    if (finished) return;
    const nextEnemyHp = Math.max(0, enemyHp - 30);
    setTeam(current => current.map((c, i) => i === 0 ? { ...c, light: Math.max(0, c.light - 15) } : c));
    setEnemyHp(nextEnemyHp);
    if (nextEnemyHp === 0) {
      setFinished(true);
      setLog(current => ["Demo victory! The opposing character was defeated.", "Special move used: 15 Light spent; 30 demo damage dealt.", ...current].slice(0, 8));
    } else {
      setLog(current => ["Special move used: 15 Light spent; 30 demo damage dealt.", ...current].slice(0, 8));
    }
  }
  function endTurn() {
    if (finished) return;
    const activeIndex = team.findIndex(character => character.hp > 0);
    if (activeIndex < 0) { setFinished(true); return; }
    const remainingHp = team[activeIndex].hp - 10;
    setTeam(current => current.map((character, index) => index === activeIndex ? { ...character, hp: Math.max(0, character.hp - 10) } : character));
    setTurn(n => n + 1);
    if (remainingHp <= 0 && team.every((character, index) => index === activeIndex || character.hp <= 0)) {
      setFinished(true);
      setLog(current => ["Demo defeat: all your characters have been defeated.", "Computer opponent dealt 10 damage.", ...current].slice(0, 8));
    } else {
      setLog(current => ["Computer opponent dealt 10 damage. Turn " + (turn + 1) + " started.", ...current].slice(0, 8));
    }
  }
  function reset() { setTeam(initialTeam); setEnemyHp(120); setTurn(1); setFinished(false); setLog(["Battle demo reset."]); }

  return <div className="container-page"><PageHeading title="Battle arena" description="A basic interactive preview of the turn-based battle interface." />
    <Message type="warning">Demo mode: the backend branch does not yet include match or game-action APIs. Battle state is local to this browser session and is not written to MySQL.</Message>
    <div className="mt-5 grid gap-4 lg:grid-cols-2"><section className="panel"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Your team</h2><span className="badge">Turn {turn}</span></div><div className="mt-4 space-y-3">{team.map((c,i) => <div key={c.name} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><strong>{c.name}</strong><span className="text-xs text-slate-500">{i === 0 ? "Active" : "Available"}</span></div><div className="mt-2 flex flex-wrap gap-4 text-sm"><span>HP: <strong>{c.hp}</strong></span><span>Light: <strong>{c.light}</strong></span></div><div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-emerald-500" style={{ width: (c.hp / (i === 1 ? 90 : i === 2 ? 120 : 100) * 100) + "%" }} /></div></div>)}</div></section>
      <section className="panel"><h2 className="text-lg font-bold">Computer opponent</h2><div className="mt-4 rounded-xl border border-slate-200 p-4"><span className="badge">Shardbearer · Demo enemy</span><h3 className="mt-3 text-xl font-bold">Opposing character</h3><p className="mt-2">HP: <strong>{enemyHp} / 120</strong></p><div className="mt-2 h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-rose-500" style={{ width: (enemyHp / 120 * 100) + "%" }} /></div>{finished && <p className="mt-3 font-bold text-emerald-700">Victory (demo)</p>}</div>
        <h3 className="mt-5 font-bold">Available actions</h3><div className="mt-3 flex flex-wrap gap-2"><button className="btn btn-primary" onClick={attack} disabled={finished || enemyHp <= 0}>Basic attack (20)</button><button className="btn" onClick={special} disabled={finished || enemyHp <= 0 || team[0].light < 15}>Special move (30)</button><button className="btn" onClick={endTurn} disabled={finished}>End turn</button><button className="btn" onClick={reset}>Reset demo</button></div>
      </section></div>
    <section className="panel mt-4"><h2 className="font-bold">Action log</h2><ul className="mt-3 space-y-2 text-sm text-slate-600">{log.map((entry,i) => <li key={i} className="border-b border-slate-100 pb-2">{entry}</li>)}</ul></section>
  </div>;
}
export default function BattlePage() { return <ProtectedPage><BattleContent /></ProtectedPage>; }
