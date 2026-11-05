
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/authorization";
import pool from "@/lib/mysql";
import clientPromise from "@/lib/mongodb";

// Validate deck ID from URL
function validateDeckId(value) {
    const deckId = Number(value);

    return Number.isSafeInteger(deckId) && deckId > 0
        ? deckId
        : null;
}


// GET: Retrieve an individual deck and its cards
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
        const deckId = validateDeckId(rawDeckId);

        if (!deckId) {
            return NextResponse.json({
                success: false,
                message: "Invalid deck ID."
            }, { status: 400 });
        }

        // Retrieve deck only if it belongs to the authenticated player
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
             WHERE d.deck_id = ?
             AND d.player_id = ?
             GROUP BY
                d.deck_id,
                d.deck_name,
                d.created_at`,
            [deckId, player.player_id]
        );

        if (decks.length === 0) {
            return NextResponse.json({
                success: false,
                message: "Deck not found."
            }, { status: 404 });
        }

        // Retrieve cards belonging to this deck
        const [cards] = await pool.execute(
            `SELECT
                c.card_id,
                c.card_name,
                c.card_type,
                c.rarity,
                c.description,
                dc.quantity,
                cc.character_type,
                cc.base_hp,
                cc.max_light,
                cc.weapon_or_spren,
                cc.order_name,
                cc.recovery_turns,
                eh.event_helper_type,
                eh.duration_turns
             FROM DECK_CARD dc
             JOIN CARD c
                ON dc.card_id = c.card_id
             LEFT JOIN CHARACTER_CARD cc
                ON c.card_id = cc.card_id
             LEFT JOIN EVENT_HELPER eh
                ON c.card_id = eh.card_id
             WHERE dc.deck_id = ?
             ORDER BY c.card_id`,
            [deckId]
        );

        // Retrieve flexible card details from MongoDB
        let detailsMap = {};

        if (cards.length > 0) {
            const client = await clientPromise;
            const db = client.db(process.env.MONGODB_DB);

            const cardDetails = await db
                .collection("card_details")
                .find(
                    {
                        card_id: {
                            $in: cards.map(card => card.card_id)
                        }
                    },
                    {
                        projection: { _id: 0 }
                    }
                )
                .toArray();

            detailsMap = Object.fromEntries(
                cardDetails.map(detail => [
                    detail.card_id,
                    detail
                ])
            );
        }

        // Combine MySQL and MongoDB card information
        const deckCards = cards.map(card => ({
            ...card,
            details: detailsMap[card.card_id] || null
        }));

        return NextResponse.json({
            success: true,
            message: "Deck retrieved successfully.",
            data: {
                deck: {
                    ...decks[0],
                    cards: deckCards
                }
            }
        });

    } catch (error) {
        console.error("Get individual deck error:", error);

        return NextResponse.json({
            success: false,
            message: "Unable to retrieve deck."
        }, { status: 500 });
    }
}


// PUT: Rename an existing deck
export async function PUT(request, { params }) {
    const { player, response } = await authorizeRequest([
        "PLAYER",
        "ADMIN"
    ]);

    if (response) {
        return response;
    }

    try {
        const { deckId: rawDeckId } = await params;
        const deckId = validateDeckId(rawDeckId);

        if (!deckId) {
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

        // Only deck_name can be modified through this endpoint
        const fields = Object.keys(body);

        if (
            fields.length !== 1 ||
            fields[0] !== "deck_name"
        ) {
            return NextResponse.json({
                success: false,
                message: "Only the deck_name field can be updated."
            }, { status: 400 });
        }

        const { deck_name } = body;

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

        // Verify deck ownership
        const [existingDecks] = await pool.execute(
            `SELECT deck_id
             FROM DECK
             WHERE deck_id = ?
             AND player_id = ?
             LIMIT 1`,
            [deckId, player.player_id]
        );

        if (existingDecks.length === 0) {
            return NextResponse.json({
                success: false,
                message: "Deck not found."
            }, { status: 404 });
        }

        // Update deck name
        await pool.execute(
            `UPDATE DECK
             SET deck_name = ?
             WHERE deck_id = ?
             AND player_id = ?`,
            [deck_name.trim(), deckId, player.player_id]
        );

        // Retrieve updated deck
        const [updatedDecks] = await pool.execute(
            `SELECT
                deck_id,
                deck_name,
                created_at
             FROM DECK
             WHERE deck_id = ?
             AND player_id = ?
             LIMIT 1`,
            [deckId, player.player_id]
        );

        return NextResponse.json({
            success: true,
            message: "Deck renamed successfully.",
            data: {
                deck: updatedDecks[0]
            }
        });

    } catch (error) {
        console.error("Rename deck error:", error);

        return NextResponse.json({
            success: false,
            message: "Unable to rename deck."
        }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
  const { player, response } = await authorizeRequest([
    "PLAYER",
    "ADMIN"
  ]);

  if (response) return response;

  try {
    const { deckId } = await params;
    const id = Number(deckId);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid deck ID."
        },
        { status: 400 }
      );
    }

    const [decks] = await pool.execute(
      `SELECT deck_id
       FROM DECK
       WHERE deck_id = ? AND player_id = ?
       LIMIT 1`,
      [id, player.player_id]
    );

    if (decks.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Deck not found."
        },
        { status: 404 }
      );
    }

    await pool.execute(
      `DELETE FROM DECK
       WHERE deck_id = ? AND player_id = ?`,
      [id, player.player_id]
    );

    return NextResponse.json({
      success: true,
      message: "Deck deleted successfully."
    });

  } catch (error) {
    console.error("Delete deck error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to delete deck."
      },
      { status: 500 }
    );
  }
}