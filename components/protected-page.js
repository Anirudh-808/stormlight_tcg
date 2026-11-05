"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export function ProtectedPage({ children }) {
  const { player, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!loading && !player) router.replace("/login"); }, [loading, player, router]);
  if (loading || !player) return <div className="container-page"><div className="panel py-12 text-center text-slate-500">Checking your session…</div></div>;
  return children;
}
