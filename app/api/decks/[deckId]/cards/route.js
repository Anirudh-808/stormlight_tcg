
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/authorization";
import pool from "@/lib/mysql";

export async function POST(request, { params }) {
    const { player, response } = await authorizeRequest([
        "PLAYER",
        "ADMIN"
    ]);

    if (response) {
        return response;
    }

    try {
        const { deckId: rawDeckId } = await params;
        const deckId = Number(rawDeckId);

        if (!Number.isSafeInteger(deckId) || deckId <= 0) {
            return NextResponse.json({
                success: false,
                message: "Invalid deck ID."
            }, { status: 400 });
        }

        // Parse request body
        let body;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json({
                success: false,
                message: "Request body must contain valid JSON."
            }, { status: 400 });
        }

        if (
            !body ||
            typeof body !== "object" ||
            Array.isArray(body)
        ) {
            return NextResponse.json({
                success: false,
                message: "Invalid request body."
            }, { status: 400 });
        }

        const { card_id, quantity } = body;

        if (
            !Number.isSafeInteger(card_id) ||
            card_id <= 0
        ) {
            return NextResponse.json({
                success: false,
                message: "A valid card_id is required."
            }, { status: 400 });
        }

        if (
            !Number.isSafeInteger(quantity) ||
            quantity <= 0
        ) {
            return NextResponse.json({
                success: false,
                message: "Quantity must be a positive integer."
            }, { status: 400 });
        }

        // Verify deck ownership
        const [decks] = await pool.execute(
            `SELECT deck_id
             FROM DECK
             WHERE deck_id = ?
             AND player_id = ?
             LIMIT 1`,
            [deckId, player.player_id]
        );

        if (decks.length === 0) {
            return NextResponse.json({
                success: false,
                message: "Deck not found."
            }, { status: 404 });
        }

        // Add card using the stored procedure
        await pool.query(
            "CALL AddCardToDeck(?, ?, ?)",
            [deckId, card_id, quantity]
        );

        // Retrieve the updated card entry
        const [cards] = await pool.execute(
            `SELECT
                c.card_id,
                c.card_name,
                c.card_type,
                c.rarity,
                dc.quantity
             FROM DECK_CARD dc
             JOIN CARD c ON dc.card_id = c.card_id
             WHERE dc.deck_id = ?
             AND dc.card_id = ?`,
            [deckId, card_id]
        );

        const [totals] = await pool.execute(
            `SELECT COALESCE(SUM(quantity), 0) AS total_cards
             FROM DECK_CARD
             WHERE deck_id = ?`,
            [deckId]
        );

        return NextResponse.json({
            success: true,
            message: "Card added to deck successfully.",
            data: {
                card: cards[0],
                total_cards: totals[0].total_cards
            }
        });

    } catch (error) {
        console.error("Add card to deck error:", error);

        // Handle validation errors raised by MySQL procedures/triggers
        if (
            error.errno === 1644 ||
            error.code === "ER_SIGNAL_EXCEPTION"
        ) {
            return NextResponse.json({
                success: false,
                message: error.sqlMessage || "Card could not be added."
            }, { status: 400 });
        }

        return NextResponse.json({
            success: false,
            message: "Unable to add card to deck."
        }, { status: 500 });
    }
}
