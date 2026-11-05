
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/authorization";
import pool from "@/lib/mysql";

// DELETE: Remove copies of a card from a deck
export async function DELETE(request, { params }) {
    const { player, response } = await authorizeRequest([
        "PLAYER",
        "ADMIN"
    ]);

    if (response) {
        return response;
    }

    try {
        const {
            deckId: rawDeckId,
            cardId: rawCardId
        } = await params;

        const deckId = Number(rawDeckId);
        const cardId = Number(rawCardId);

        // Validate IDs
        if (
            !Number.isSafeInteger(deckId) ||
            deckId <= 0 ||
            !Number.isSafeInteger(cardId) ||
            cardId <= 0
        ) {
            return NextResponse.json({
                success: false,
                message: "Invalid deck ID or card ID."
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

        // Only quantity is allowed
        if (
            Object.keys(body).length !== 1 ||
            !Object.prototype.hasOwnProperty.call(body, "quantity")
        ) {
            return NextResponse.json({
                success: false,
                message: "Only the quantity field is allowed."
            }, { status: 400 });
        }

        const { quantity } = body;

        if (
            !Number.isSafeInteger(quantity) ||
            quantity <= 0
        ) {
            return NextResponse.json({
                success: false,
                message: "Quantity must be a positive integer."
            }, { status: 400 });
        }

        // Verify that the deck belongs to the authenticated player
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

        // Remove card using the stored procedure
        await pool.query(
            "CALL RemoveCardFromDeck(?, ?, ?)",
            [deckId, cardId, quantity]
        );

        // Retrieve the remaining card entry, if any
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
            [deckId, cardId]
        );

        // Calculate updated deck size
        const [totals] = await pool.execute(
            `SELECT COALESCE(SUM(quantity), 0) AS total_cards
             FROM DECK_CARD
             WHERE deck_id = ?`,
            [deckId]
        );

        return NextResponse.json({
            success: true,
            message: "Card removed from deck successfully.",
            data: {
                card: cards.length > 0 ? cards[0] : null,
                total_cards: totals[0].total_cards
            }
        });

    } catch (error) {
        console.error("Remove card from deck error:", error);

        // Handle errors raised by the stored procedure
        if (
            error.errno === 1644 ||
            error.code === "ER_SIGNAL_EXCEPTION"
        ) {
            return NextResponse.json({
                success: false,
                message: error.sqlMessage || "Card could not be removed."
            }, { status: 400 });
        }

        return NextResponse.json({
            success: false,
            message: "Unable to remove card from deck."
        }, { status: 500 });
    }
}
