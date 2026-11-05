"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";

const links = [
  ["/dashboard", "Dashboard"], ["/collection", "Collection"], ["/decks", "Deck Builder"],
  ["/store", "Pack Store"], ["/battle", "Battle Arena"], ["/history", "Match History"], ["/profile", "Profile"],
];

export function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { player, loading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    try { await logout(); router.push("/"); }
    catch (error) { window.alert(error.message || "Could not log out."); }
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="container-page flex min-h-[66px] items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-extrabold tracking-tight text-[#244463]">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#315a83] text-lg text-white">S</span>
            <span>STORMLIGHT <span className="text-slate-500">TCG</span></span>
          </Link>
          <button className="btn md:hidden" onClick={() => setMenuOpen(v => !v)} aria-expanded={menuOpen}>{menuOpen ? "Close" : "Menu"}</button>
          <nav className={menuOpen ? "absolute left-0 right-0 top-[66px] flex flex-col gap-1 border-b border-slate-200 bg-white p-3 md:static md:flex md:flex-row md:items-center md:border-0 md:bg-transparent md:p-0" : "hidden absolute left-0 right-0 top-[66px] flex-col gap-1 border-b border-slate-200 bg-white p-3 md:static md:flex md:flex-row md:items-center md:border-0 md:bg-transparent md:p-0"}>
            {player && links.map(([href, label]) => (
              <Link key={href} href={href} onClick={() => setMenuOpen(false)}
                className={pathname === href || (href === "/decks" && pathname.startsWith("/decks/")) ? "rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-[#244463]" : "rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"}>
                {label}
              </Link>
            ))}
            {!loading && !player && <><Link href="/login" className="btn">Login</Link><Link href="/register" className="btn btn-primary">Create account</Link></>}
            {player && <div className="flex items-center gap-2 border-t border-slate-100 pt-3 md:ml-2 md:border-0 md:pt-0">
              <span className="hidden max-w-[130px] truncate text-xs font-semibold text-slate-500 lg:inline">{player.username}</span>
              <button className="btn" onClick={handleLogout}>Log out</button>
            </div>}
          </nav>
        </div>
      </header>
      <main className="min-h-[calc(100vh-66px)] py-7">{children}</main>
      <footer className="border-t border-slate-200 bg-white py-5 text-center text-xs text-slate-500">Stormlight Archive Trading Card Game · DBMS Level 3 Project</footer>
    </>
  );
}
