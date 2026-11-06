
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/authorization";
import pool from "@/lib/mysql";

export async function GET(request, { params }) {
    const { player, response } = await authorizeRequest([
        "PLAYER",
        "ADMIN"
    ]);

    if (response) return response;

    const matchId = Number((await params).matchId);
    const playerId = Number(player.player_id);

    if (!Number.isInteger(matchId) || matchId <= 0) {
        return NextResponse.json(
            { error: "Invalid match ID." },
            { status: 400 }
        );
    }

    let connection;

    try {
        connection = await pool.getConnection();

        // 1. Retrieve match information
        const [matchRows] = await connection.execute(
            `SELECT
                match_id,
                player_1_id,
                player_2_id,
                winner_id,
                status
             FROM MATCHES
             WHERE match_id = ?`,
            [matchId]
        );

        const match = matchRows[0];

        if (!match) {
            return NextResponse.json(
                { error: "Match not found." },
                { status: 404 }
            );
        }

        // 2. Verify that the requester belongs to this match
        const isPlayer1 = Number(match.player_1_id) === playerId;
        const isPlayer2 = Number(match.player_2_id) === playerId;

        if (!isPlayer1 && !isPlayer2) {
            return NextResponse.json(
                { error: "You are not a participant in this match." },
                { status: 403 }
            );
        }

        const opponentPlayerId = isPlayer1
            ? Number(match.player_2_id)
            : Number(match.player_1_id);

        // 3. Retrieve player information
        const [playerRows] = await connection.execute(
            `SELECT player_id, is_computer
             FROM PLAYER
             WHERE player_id IN (?, ?)`,
            [playerId, opponentPlayerId]
        );

        const opponent = playerRows.find(
            p => Number(p.player_id) === opponentPlayerId
        );

        if (!opponent) {
            throw new Error("Opponent information could not be found.");
        }

        // 4. Retrieve the current turn
        const [turnRows] = await connection.execute(
            `SELECT
                turn_id,
                turn_number,
                player_id,
                started_at,
                ended_at
             FROM TURN
             WHERE match_id = ?
             AND ended_at IS NULL
             ORDER BY turn_number DESC
             LIMIT 1`,
            [matchId]
        );

        const currentTurn = turnRows[0] || null;

        // 5. Retrieve all characters belonging to both players
        const [characterRows] = await connection.execute(
            `SELECT
                mc.match_character_id,
                mc.player_id,
                mc.card_id,
                c.card_name,
                cc.character_type,
                cc.base_hp,
                cc.max_light,
                mc.position,
                mc.current_hp,
                mc.current_light,
                mc.current_intent,
                mc.current_ideal,
                mc.status,
                mc.recovery_turns_remaining
             FROM MATCH_CHARACTER mc
             JOIN CHARACTER_CARD cc
                ON cc.card_id = mc.card_id
             JOIN CARD c
                ON c.card_id = mc.card_id
             WHERE mc.match_id = ?
             ORDER BY mc.player_id, mc.position`,
            [matchId]
        );

        const yourCharacters = characterRows.filter(
            character => Number(character.player_id) === playerId
        );

        const opponentCharacters = characterRows.filter(
            character => Number(character.player_id) === opponentPlayerId
        );

        // 6. Retrieve your event/helper cards
        // Opponent's card identities are not exposed
        const [cardRows] = await connection.execute(
            `SELECT
                mc.match_card_id,
                mc.card_id,
                c.card_name,
                c.card_type,
                mc.zone,
                mc.cooldown_turns_remaining,
                eh.event_helper_type,
                eh.duration_turns,
                eh.cooldown_turns
             FROM MATCH_CARD mc
             JOIN CARD c
                ON c.card_id = mc.card_id
             LEFT JOIN EVENT_HELPER eh
                ON eh.card_id = mc.card_id
             WHERE mc.match_id = ?
             AND mc.player_id = ?
             AND mc.zone IN ('HAND', 'COOLDOWN')
             ORDER BY mc.zone, mc.draw_order`,
            [matchId, playerId]
        );

        // 7. Retrieve draw pile counts for both players
        const [pileRows] = await connection.execute(
            `SELECT
                player_id,
                COUNT(*) AS card_count
             FROM MATCH_CARD
             WHERE match_id = ?
             AND zone = 'DRAW_PILE'
             GROUP BY player_id`,
            [matchId]
        );

        const yourDrawPile = pileRows.find(
            row => Number(row.player_id) === playerId
        );

        const opponentDrawPile = pileRows.find(
            row => Number(row.player_id) === opponentPlayerId
        );

        // 8. Retrieve opponent's hand count without exposing card identities
        const [opponentHandRows] = await connection.execute(
            `SELECT COUNT(*) AS hand_count
             FROM MATCH_CARD
             WHERE match_id = ?
             AND player_id = ?
             AND zone = 'HAND'`,
            [matchId, opponentPlayerId]
        );

        const opponentHandCount = Number(
            opponentHandRows[0].hand_count
        );

        // 9. Retrieve the latest 10 match actions
        const [actionRows] = await connection.execute(
            `SELECT
                ga.action_id,
                ga.action_type,
                ga.value,
                ga.status_applied,
                ga.created_at,
                t.turn_id,
                t.turn_number,
                t.player_id AS action_player_id,
                source_mc.match_character_id AS source_character_id,
                source_c.card_name AS source_character_name,
                target_mc.match_character_id AS target_character_id,
                target_c.card_name AS target_character_name
             FROM GAME_ACTION ga
             JOIN TURN t
                ON t.turn_id = ga.turn_id
             JOIN MATCH_CHARACTER source_mc
                ON source_mc.match_character_id =
                   ga.source_match_character_id
             JOIN CARD source_c
                ON source_c.card_id = source_mc.card_id
             LEFT JOIN MATCH_CHARACTER target_mc
                ON target_mc.match_character_id =
                   ga.target_match_character_id
             LEFT JOIN CARD target_c
                ON target_c.card_id = target_mc.card_id
             WHERE t.match_id = ?
             ORDER BY ga.created_at DESC, ga.action_id DESC
             LIMIT 10`,
            [matchId]
        );

        // 10. Build the response
        const formatCharacter = character => ({
            match_character_id: Number(character.match_character_id),
            card_id: Number(character.card_id),
            card_name: character.card_name,
            character_type: character.character_type,
            position: Number(character.position),
            current_hp: Number(character.current_hp),
            base_hp: Number(character.base_hp),
            current_light: Number(character.current_light),
            max_light: Number(character.max_light),
            current_intent: character.current_intent,
            current_ideal: character.current_ideal,
            status: character.status,
            recovery_turns_remaining: Number(
                character.recovery_turns_remaining
            ),
            is_active: character.status === "ACTIVE"
        });

        return NextResponse.json({
            success: true,

            match: {
                match_id: Number(match.match_id),
                status: match.status,
                winner_id: match.winner_id === null
                    ? null
                    : Number(match.winner_id)
            },

            you: {
                player_id: playerId,
                characters: yourCharacters.map(formatCharacter),
                active_character: yourCharacters
                    .filter(c => c.status === "ACTIVE")
                    .map(formatCharacter)[0] || null,

                cards: cardRows.map(card => ({
                    match_card_id: Number(card.match_card_id),
                    card_id: Number(card.card_id),
                    card_name: card.card_name,
                    card_type: card.card_type,
                    zone: card.zone,
                    cooldown_turns_remaining: Number(
                        card.cooldown_turns_remaining
                    ),
                    event_helper_type: card.event_helper_type,
                    duration_turns: card.duration_turns === null
                        ? null
                        : Number(card.duration_turns),
                    cooldown_turns: card.cooldown_turns === null
                        ? null
                        : Number(card.cooldown_turns)
                })),

                draw_pile_count: Number(yourDrawPile?.card_count || 0)
            },

            opponent: {
                player_id: opponentPlayerId,
                is_computer: Boolean(opponent.is_computer),
                characters: opponentCharacters.map(formatCharacter),
                active_character: opponentCharacters
                    .filter(c => c.status === "ACTIVE")
                    .map(formatCharacter)[0] || null,

                hand_count: opponentHandCount,

                draw_pile_count: Number(
                    opponentDrawPile?.card_count || 0
                )
            },

            current_turn: currentTurn
                ? {
                    turn_id: Number(currentTurn.turn_id),
                    turn_number: Number(currentTurn.turn_number),
                    player_id: Number(currentTurn.player_id),
                    is_your_turn:
                        Number(currentTurn.player_id) === playerId,
                    started_at: currentTurn.started_at
                }
                : null,

            recent_actions: actionRows.map(action => ({
                action_id: Number(action.action_id),
                turn_id: Number(action.turn_id),
                turn_number: Number(action.turn_number),
                player_id: Number(action.action_player_id),

                actor: Number(action.action_player_id) === playerId
                    ? "YOU"
                    : "OPPONENT",

                action_type: action.action_type,

                value: action.value === null
                    ? null
                    : Number(action.value),

                status_applied: action.status_applied,

                source_character: {
                    match_character_id: Number(
                        action.source_character_id
                    ),
                    card_name: action.source_character_name
                },

                target_character: action.target_character_id === null
                    ? null
                    : {
                        match_character_id: Number(
                            action.target_character_id
                        ),
                        card_name: action.target_character_name
                    },

                created_at: action.created_at
            }))
        });

    } catch (error) {
        console.error("Match state error:", error);

        return NextResponse.json(
            {
                error: error.message || "Failed to retrieve match state."
            },
            { status: 500 }
        );

    } finally {
        if (connection) {
            connection.release();
        }
    }
}
