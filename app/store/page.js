
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ProtectedPage } from "@/components/protected-page";
import { useAuth } from "@/components/auth-provider";
import {
  PageHeading,
  LoadingPanel,
  Message,
} from "@/components/ui";
import { apiRequest } from "@/lib/api-client";

function StoreContent() {
  const { player, refresh } = useAuth();

  const [packs, setPacks] = useState([]);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasingPackId, setPurchasingPackId] = useState(null);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [revealedCards, setRevealedCards] = useState([]);
  const [purchase, setPurchase] = useState(null);
  const [collectionSummary, setCollectionSummary] = useState(null);

  const loadPacks = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await apiRequest("/api/packs");

      setPacks(result?.data?.packs || []);

      const spheres = Number(result?.data?.player_spheres);

      setBalance(
        Number.isFinite(spheres) ? spheres : null
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPacks();
  }, [loadPacks]);

  async function purchasePack(pack) {
    const packId = Number(pack.pack_id);
    const cost = Number(pack.pack_cost);
    const currentBalance = balance ?? Number(player?.spheres);

    if (purchasingPackId !== null) return;

    if (
      !Number.isSafeInteger(packId) ||
      packId <= 0 ||
      !Number.isFinite(cost) ||
      cost <= 0
    ) {
      setError("Invalid pack information.");
      return;
    }

    if (
      !Number.isFinite(currentBalance) ||
      currentBalance < cost
    ) {
      setError("You do not have enough Spheres to purchase this pack.");
      return;
    }

    const confirmed = window.confirm(
      `Purchase this ${pack.card_count}-card pack for ${cost} Spheres?`
    );

    if (!confirmed) return;

    setError("");
    setNotice("");
    setRevealedCards([]);
    setPurchase(null);
    setCollectionSummary(null);
    setPurchasingPackId(packId);

    try {
      const result = await apiRequest("/api/packs", {
        method: "POST",
        body: JSON.stringify({
          pack_id: packId,
        }),
      });

      // The backend returns purchase and cards at the top level.
      const purchaseData =
        result?.purchase ||
        result?.data?.purchase ||
        null;

      const cards = Array.isArray(result?.cards)
        ? result.cards
        : Array.isArray(result?.data?.cards)
          ? result.data.cards
          : [];

      setPurchase(purchaseData);
      setRevealedCards(cards);

      if (purchaseData?.remaining_spheres !== undefined) {
        const remaining = Number(
          purchaseData.remaining_spheres
        );

        if (Number.isFinite(remaining)) {
          setBalance(remaining);
        }
      }

      setNotice(
        result?.message ||
        "Pack purchased successfully!"
      );

      // Refresh the authenticated player's latest balance.
      await refresh();

      // Confirm that the collection has been updated.
      try {
        const collectionResult = await apiRequest(
          "/api/players/collection"
        );

        setCollectionSummary(
          collectionResult?.data?.summary || null
        );
      } catch {
        // A successful purchase remains successful even
        // if refreshing the collection summary fails.
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setPurchasingPackId(null);
    }
  }

  const displayedBalance =
    balance ?? player?.spheres ?? null;

  function formatNumber(value) {
    const number = Number(value);

    return Number.isFinite(number)
      ? number.toLocaleString("en-IN")
      : "—";
  }

  return (
    <div className="container-page">
      <PageHeading
        title="Pack store"
        description="Purchase card packs using Spheres and expand your collection."
        action={
          <Link href="/collection" className="btn">
            View collection
          </Link>
        }
      />

      <Message type="error">{error}</Message>
      <Message>{notice}</Message>

      <div className="grid gap-4 sm:grid-cols-2 mb-5">
        <div className="panel">
          <p className="text-sm text-slate-500">
            Your Sphere balance
          </p>
          <p className="stat-value mt-2">
            {displayedBalance === null
              ? "—"
              : formatNumber(displayedBalance)}
          </p>
        </div>

        <div className="panel">
          <p className="text-sm text-slate-500">
            Available pack types
          </p>
          <p className="stat-value mt-2">
            {loading ? "…" : packs.length}
          </p>
        </div>
      </div>

      {loading ? (
        <LoadingPanel text="Loading available packs…" />
      ) : packs.length === 0 ? (
        <div className="panel py-10 text-center">
          <p className="text-slate-600">
            No packs are currently available.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {packs.map((pack) => {
            const cost = Number(pack.pack_cost);
            const insufficient =
              displayedBalance === null ||
              displayedBalance < cost;

            const busy = purchasingPackId !== null;

            return (
              <section
                className="panel"
                key={pack.pack_id}
              >
                <span className="badge">
                  Available pack
                </span>

                <h2 className="mt-3 text-2xl font-black text-slate-800">
                  {pack.card_count}-card pack
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Receive {pack.card_count} randomly generated
                  cards, with rarity-weighted selection.
                </p>

                <div className="my-5 text-3xl font-black text-[#315a83]">
                  {formatNumber(cost)}
                  <span className="text-base font-semibold">
                    {" "}Spheres
                  </span>
                </div>

                <button
                  className="btn btn-primary w-full"
                  disabled={busy || insufficient}
                  onClick={() => purchasePack(pack)}
                >
                  {purchasingPackId === Number(pack.pack_id)
                    ? "Purchasing..."
                    : insufficient
                      ? "Insufficient Spheres"
                      : "Purchase pack"}
                </button>

                {insufficient && (
                  <p className="mt-2 text-xs text-red-600">
                    You need at least {formatNumber(cost)} Spheres.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}

      {revealedCards.length > 0 && (
        <section className="panel mt-6">
          <h2 className="text-xl font-bold text-slate-800">
            Your pack has been opened!
          </h2>

          {purchase && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="card-tile">
                <p className="text-xs text-slate-500">
                  Purchase ID
                </p>
                <p className="stat-value">
                  #{purchase.purchase_id}
                </p>
              </div>

              <div className="card-tile">
                <p className="text-xs text-slate-500">
                  Spheres spent
                </p>
                <p className="stat-value">
                  {formatNumber(purchase.spheres_spent)}
                </p>
              </div>

              <div className="card-tile">
                <p className="text-xs text-slate-500">
                  Remaining balance
                </p>
                <p className="stat-value">
                  {formatNumber(purchase.remaining_spheres)}
                </p>
              </div>
            </div>
          )}

          <h3 className="mt-5 font-bold">
            Cards received ({revealedCards.length})
          </h3>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {revealedCards.map((card, index) => (
              <article
                className="card-tile"
                key={`${card.card_id}-${card.slot_number || index}`}
              >
                <div className="flex justify-between gap-2">
                  <span className="badge">
                    Card {card.slot_number || index + 1}
                  </span>
                  <span className="badge">
                    {card.rarity}
                  </span>
                </div>

                <h3 className="mt-3 font-bold text-slate-800">
                  {card.card_name}
                </h3>

                <p className="mt-1 text-xs uppercase text-slate-500">
                  {card.card_type}
                </p>

                <p className="mt-2 text-sm text-slate-600">
                  {card.description}
                </p>
              </article>
            ))}
          </div>

          {collectionSummary && (
            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <p className="font-semibold text-slate-800">
                Your collection has been updated!
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {formatNumber(collectionSummary.total_cards)} total
                copies across {collectionSummary.distinct_cards}
                distinct cards.
              </p>

              <Link
                href="/collection"
                className="text-sm font-semibold text-blue-700 underline mt-2 inline-block"
              >
                View updated collection →
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default function StorePage() {
  return (
    <ProtectedPage>
      <StoreContent />
    </ProtectedPage>
  );
}
