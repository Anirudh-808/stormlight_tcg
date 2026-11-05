
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/authorization";
import pool from "@/lib/mysql";

// GET: Retrieve all decks belonging to the authenticated player
export async function GET() {
    const { player, response } = await authorizeRequest([
        "PLAYER",
        "ADMIN"
    ]);

    if (response) {
        return response;
    }

    try {
        const [decks] = await pool.execute(
            `SELECT
                d.deck_id,
                d.deck_name,
                d.created_at,
                COUNT(dc.card_id) AS distinct_cards,
                COALESCE(SUM(dc.quantity), 0) AS total_cards
             FROM DECK d
             LEFT JOIN DECK_CARD dc
                ON d.deck_id = dc.deck_id
             WHERE d.player_id = ?
             GROUP BY
                d.deck_id,
                d.deck_name,
                d.created_at
             ORDER BY d.created_at DESC`,
            [player.player_id]
        );

        return NextResponse.json({
            success: true,
            message: "Player decks retrieved successfully.",
            data: {
                decks
            }
        });

    } catch (error) {
        console.error("Get decks error:", error);

        return NextResponse.json({
            success: false,
            message: "Unable to retrieve player decks."
        }, { status: 500 });
    }
}


// POST: Create a new empty deck
export async function POST(request) {
    const { player, response } = await authorizeRequest([
        "PLAYER",
        "ADMIN"
    ]);

    if (response) {
        return response;
    }

    try {
        let body;

        // Parse and validate JSON body
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

        const { deck_name } = body;

        // Validate deck name
        if (
            typeof deck_name !== "string" ||
            deck_name.trim().length === 0 ||
            deck_name.trim().length > 100
        ) {
            return NextResponse.json({
                success: false,
                message: "Deck name must be between 1 and 100 characters."
            }, { status: 400 });
        }

        // Create an empty deck
        const [result] = await pool.execute(
            `INSERT INTO DECK (player_id, deck_name)
             VALUES (?, ?)`,
            [player.player_id, deck_name.trim()]
        );

        // Retrieve the newly created deck
        const [newDeck] = await pool.execute(
            `SELECT
                deck_id,
                player_id,
                deck_name,
                created_at
             FROM DECK
             WHERE deck_id = ?
             LIMIT 1`,
            [result.insertId]
        );

        return NextResponse.json({
            success: true,
            message: "Empty deck created successfully.",
            data: {
                deck: {
                    ...newDeck[0],
                    distinct_cards: 0,
                    total_cards: 0
                }
            }
        }, { status: 201 });

    } catch (error) {
        console.error("Create deck error:", error);

        return NextResponse.json({
            success: false,
            message: "Unable to create deck."
        }, { status: 500 });
    }
}
