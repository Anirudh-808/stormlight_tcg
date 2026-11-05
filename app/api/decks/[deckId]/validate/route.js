
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/authorization";
import pool from "@/lib/mysql";

// POST: Validate whether a deck is ready for a match
export async function GET(request, { params }) {
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

        // Validate deck ID
        if (!Number.isSafeInteger(deckId) || deckId <= 0) {
            return NextResponse.json({
                success: false,
                message: "Invalid deck ID."
            }, { status: 400 });
        }

        // Verify deck ownership
        const [decks] = await pool.execute(
            `SELECT deck_id, deck_name
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

        // Check that every character card appears exactly once
        const [invalidCharacters] = await pool.execute(
            `SELECT
                c.card_id,
                c.card_name,
                dc.quantity
             FROM DECK_CARD dc
             JOIN CARD c ON dc.card_id = c.card_id
             WHERE dc.deck_id = ?
             AND c.card_type = 'CHARACTER'
             AND dc.quantity <> 1`,
            [deckId]
        );

        if (invalidCharacters.length > 0) {
            return NextResponse.json({
                success: false,
                message: "Invalid deck: character cards must be unique and have a quantity of exactly 1.",
                data: {
                    validation_status: "INVALID",
                    invalid_characters: invalidCharacters
                }
            }, { status: 400 });
        }

        // Run the existing MySQL validation procedure
        await pool.query(
            "CALL ValidateDeck(?)",
            [deckId]
        );

        // Retrieve deck statistics after successful validation
        const [statistics] = await pool.execute(
            `SELECT
                COALESCE(SUM(dc.quantity), 0) AS total_cards,
                COALESCE(SUM(
                    CASE
                        WHEN c.card_type = 'CHARACTER'
                        THEN dc.quantity ELSE 0
                    END
                ), 0) AS character_cards,
                COALESCE(SUM(
                    CASE
                        WHEN c.card_type IN ('EVENT', 'HELPER')
                        THEN dc.quantity ELSE 0
                    END
                ), 0) AS event_helper_cards
             FROM DECK_CARD dc
             JOIN CARD c ON dc.card_id = c.card_id
             WHERE dc.deck_id = ?`,
            [deckId]
        );

        return NextResponse.json({
            success: true,
            message: "Deck is valid and ready for a match.",
            data: {
                deck: decks[0],
                validation_status: "VALID",
                statistics: statistics[0]
            }
        });

    } catch (error) {
        console.error("Deck validation error:", error);

        // Handle validation errors raised by MySQL
        if (
            error.errno === 1644 ||
            error.code === "ER_SIGNAL_EXCEPTION"
        ) {
            return NextResponse.json({
                success: false,
                message: error.sqlMessage || "Deck validation failed.",
                data: {
                    validation_status: "INVALID"
                }
            }, { status: 400 });
        }

        return NextResponse.json({
            success: false,
            message: "Unable to validate deck."
        }, { status: 500 });
    }
}
