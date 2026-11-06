
import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { authorizeRequest } from "@/lib/authorization";
import pool from "@/lib/mysql";

// Validate a deck using the existing MySQL procedure
async function validateDeck(connection, deckId) {
    await connection.query(
        "CALL ValidateDeck(?)",
        [deckId]
    );

    // Retrieve the three character cards and their starting attributes
    const [characters] = await connection.execute(
        `SELECT
            dc.card_id,
            dc.quantity,
            cc.base_hp,
            cc.max_light,
            cc.recovery_turns
         FROM DECK_CARD dc
         JOIN CHARACTER_CARD cc
            ON dc.card_id = cc.card_id
         WHERE dc.deck_id = ?
         ORDER BY dc.card_id`,
        [deckId]
    );

    if (
        characters.length !== 3 ||
        characters.some(character => character.quantity !== 1)
    ) {
        throw new Error("Deck must contain exactly three unique characters.");
    }

    return characters;
}


// Shuffle and initialize one player's match cards
async function initializeMatchCards(
    connection,
    matchId,
    playerId,
    deckId
) {
    // Retrieve all Event/Helper cards in the deck
    const [deckCards] = await connection.execute(
        `SELECT dc.card_id, dc.quantity
         FROM DECK_CARD dc
         JOIN CARD c ON c.card_id = dc.card_id
         WHERE dc.deck_id = ?
         AND c.card_type IN ('EVENT', 'HELPER')`,
        [deckId]
    );

    // Expand quantities into individual physical card copies
    const cards = [];

    for (const card of deckCards) {
        for (let i = 0; i < card.quantity; i++) {
            cards.push(card.card_id);
        }
    }

    if (cards.length !== 13) {
        throw new Error(
            "Invalid deck: expected exactly 13 Event/Helper cards."
        );
    }

    // Fisher-Yates shuffle
    for (let i = cards.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);

        [cards[i], cards[j]] = [cards[j], cards[i]];
    }

    // Deal 5 cards and put the remaining 8 into the draw pile
    for (let i = 0; i < cards.length; i++) {
        const zone = i < 5 ? "HAND" : "DRAW_PILE";

        // Draw pile cards receive sequential positions starting at 1
        const drawOrder = i < 5 ? 0 : i - 4;

        await connection.execute(
            `INSERT INTO MATCH_CARD (
                match_id,
                player_id,
                card_id,
                zone,
                cooldown_turns_remaining,
                draw_order
            )
            VALUES (?, ?, ?, ?, 0, ?)`,
            [matchId, playerId, cards[i], zone, drawOrder]
        );
    }
}

// POST: Create a new match against the computer opponent
export async function POST(request) {
    const { player, response } = await authorizeRequest([
        "PLAYER",
        "ADMIN"
    ]);

    if (response) {
        return response;
    }

    let body;

    try {
        body = await request.json();
    } catch {
        return NextResponse.json({
            success: false,
            message: "Invalid JSON request body."
        }, { status: 400 });
    }

    const deckId = Number(body?.deck_id);

    if (!Number.isSafeInteger(deckId) || deckId <= 0) {
        return NextResponse.json({
            success: false,
            message: "A valid deck_id is required."
        }, { status: 400 });
    }

    let connection;

    try {
        connection = await pool.getConnection();

        await connection.beginTransaction();

        // 1. Verify that the selected deck belongs to the player
        const [playerDecks] = await connection.execute(
            `SELECT deck_id, deck_name
             FROM DECK
             WHERE deck_id = ?
             AND player_id = ?
             LIMIT 1
             FOR UPDATE`,
            [deckId, player.player_id]
        );

        if (playerDecks.length === 0) {
            await connection.rollback();

            return NextResponse.json({
                success: false,
                message: "Deck not found."
            }, { status: 404 });
        }

        // 2. Find the computer opponent
        const [bots] = await connection.execute(
            `SELECT player_id, username
             FROM PLAYER
             WHERE username = 'hoid_bot'
             AND is_computer = TRUE
             LIMIT 1`
        );

        if (bots.length === 0) {
            throw new Error("Computer opponent is not configured.");
        }

        const bot = bots[0];

        // 3. Find the bot's deck
        const [botDecks] = await connection.execute(
            `SELECT deck_id, deck_name
             FROM DECK
             WHERE player_id = ?
             ORDER BY deck_id DESC
             LIMIT 1
             FOR UPDATE`,
            [bot.player_id]
        );

        if (botDecks.length === 0) {
            throw new Error("Computer opponent does not have a deck.");
        }

        const botDeckId = botDecks[0].deck_id;

        // 4. Validate the human player's deck
        let playerCharacters;

        try {
            playerCharacters = await validateDeck(
                connection,
                deckId
            );
        } catch (error) {
            error.matchErrorType = "PLAYER_DECK_INVALID";
            throw error;
        }

        // 5. Validate the bot's deck
        let botCharacters;

        try {
            botCharacters = await validateDeck(
                connection,
                botDeckId
            );
        } catch (error) {
            error.matchErrorType = "BOT_DECK_INVALID";
            throw error;
        }

        // 6. Randomly determine the first player
        const startingPlayerId =
            randomInt(0, 2) === 0
                ? player.player_id
                : bot.player_id;

        // 7. Create the match
        const [matchResult] = await connection.execute(
            `INSERT INTO MATCHES (
                player_1_id,
                player_2_id,
                status
            )
            VALUES (?, ?, 'IN_PROGRESS')`,
            [player.player_id, bot.player_id]
        );

        const matchId = matchResult.insertId;

        // 8. Initialize characters for both players
        const sides = [
            {
                playerId: player.player_id,
                characters: playerCharacters
            },
            {
                playerId: bot.player_id,
                characters: botCharacters
            }
        ];

        for (const side of sides) {
            for (let i = 0; i < side.characters.length; i++) {
                const character = side.characters[i];

                await connection.execute(
                    `INSERT INTO MATCH_CHARACTER (
                        match_id,
                        card_id,
                        player_id,
                        position,
                        current_hp,
                        current_light,
                        current_intent,
                        current_ideal,
                        status,
                        recovery_turns_remaining
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, 0)`,
                    [
                        matchId,
                        character.card_id,
                        side.playerId,
                        i + 1,
                        character.base_hp,
                        character.max_light,
                        i === 0 ? "ACTIVE" : "AVAILABLE"
                    ]
                );
            }
        }

        // 9. Initialize Event/Helper cards for both players
        await initializeMatchCards(
            connection,
            matchId,
            player.player_id,
            deckId
        );

        await initializeMatchCards(
            connection,
            matchId,
            bot.player_id,
            botDeckId
        );

        // 10. Create the first turn
        await connection.execute(
            `INSERT INTO \`TURN\` (
                match_id,
                turn_number,
                player_id
            )
            VALUES (?, 1, ?)`,
            [matchId, startingPlayerId]
        );

        // Retrieve the human player's opening hand
        const [openingHand] = await connection.execute(
            `SELECT
                mc.match_card_id,
                mc.card_id,
                c.card_name,
                c.card_type,
                c.rarity
            FROM MATCH_CARD mc
            JOIN CARD c ON c.card_id = mc.card_id
            WHERE mc.match_id = ?
            AND mc.player_id = ?
            AND mc.zone = 'HAND'
            ORDER BY mc.match_card_id`,
            [matchId, player.player_id]
        );

        // 11. Commit the match creation
        await connection.commit();

        return NextResponse.json({
            success: true,
            message: "Match created successfully.",
            data: {
                match_id: matchId,
                status: "IN_PROGRESS",
                player: {
                    player_id: player.player_id,
                    username: player.username,
                    deck_id: deckId
                },
                opponent: {
                    player_id: bot.player_id,
                    username: bot.username,
                    deck_id: botDeckId
                },
                starting_player_id: startingPlayerId,
                characters_per_player: 3,
                initial_turn_number: 1,
                opening_hand: openingHand,
                opponent_hand_count: 5
            }
        }, { status: 201 });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }

        console.error("Match creation error:", error);

        if (error.matchErrorType === "PLAYER_DECK_INVALID") {
            return NextResponse.json({
                success: false,
                message: error.sqlMessage ||
                    error.message ||
                    "Your selected deck is invalid."
            }, { status: 400 });
        }

        if (error.matchErrorType === "BOT_DECK_INVALID") {
            return NextResponse.json({
                success: false,
                message: "The computer opponent's deck is invalid."
            }, { status: 500 });
        }

        return NextResponse.json({
            success: false,
            message: "Unable to create match."
        }, { status: 500 });

    } finally {
        if (connection) {
            connection.release();
        }
    }
}
