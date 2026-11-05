
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/authorization";
import pool from "@/lib/mysql";
import clientPromise from "@/lib/mongodb";

export async function GET() {
    try {
        // 1. Authenticate the player
        const { player, response } = await authorizeRequest([
            "PLAYER",
            "ADMIN"
        ]);

        if (response) {
            return response;
        }

        // 2. Retrieve owned cards from MySQL
        const [cards] = await pool.execute(
            `SELECT
                c.card_id,
                c.card_name,
                c.card_type,
                c.rarity,
                c.description,
                pc.quantity,
                cc.character_type,
                cc.base_hp,
                cc.max_light,
                cc.weapon_or_spren,
                cc.order_name,
                cc.recovery_turns,
                eh.event_helper_type,
                eh.duration_turns
             FROM PLAYER_CARD pc
             JOIN CARD c
                ON pc.card_id = c.card_id
             LEFT JOIN CHARACTER_CARD cc
                ON c.card_id = cc.card_id
             LEFT JOIN EVENT_HELPER eh
                ON c.card_id = eh.card_id
             WHERE pc.player_id = ?
             ORDER BY c.card_id`,
            [player.player_id]
        );

        // 3. Retrieve corresponding details from MongoDB
        const client = await clientPromise;

        const mongoCards = await client
            .db(process.env.MONGODB_DB)
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

        // 4. Create a lookup map for MongoDB details
        const detailsMap = new Map(
            mongoCards.map(card => [card.card_id, card])
        );

        // 5. Combine MySQL and MongoDB information
        const collection = cards.map(card => ({
            ...card,
            details: detailsMap.get(card.card_id) || null
        }));

        // 6. Calculate collection statistics
        const totalCards = collection.reduce(
            (total, card) => total + card.quantity,
            0
        );

        return NextResponse.json({
            success: true,
            message: "Player collection retrieved successfully.",
            data: {
                player_id: player.player_id,
                username: player.username,
                summary: {
                    distinct_cards: collection.length,
                    total_cards: totalCards
                },
                collection
            }
        });

    } catch (error) {
        console.error("Collection retrieval error:", error);

        return NextResponse.json({
            success: false,
            message: "Unable to retrieve player collection."
        }, { status: 500 });
    }
}
