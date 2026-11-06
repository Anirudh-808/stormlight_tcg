
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/authorization";
import {
    startPlayerTurn,
    executeBotTurn
} from "@/lib/match-engine";
import pool from "@/lib/mysql";

// POST: End the current player's turn, execute the bot turn if applicable,
// and start the next human turn.
export async function POST(request, { params }) {
    const { player, response } = await authorizeRequest([
        "PLAYER",
        "ADMIN"
    ]);

    if (response) {
        return response;
    }

    const { matchId: rawMatchId } = await params;
    const matchId = Number(rawMatchId);
    const playerId = Number(player.player_id);

    if (!Number.isSafeInteger(matchId) || matchId <= 0) {
        return NextResponse.json({
            success: false,
            message: "A valid match ID is required."
        }, { status: 400 });
    }

    let connection;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Lock and retrieve the match
        const [matches] = await connection.execute(
            `SELECT
                match_id,
                player_1_id,
                player_2_id,
                status
             FROM MATCHES
             WHERE match_id = ?
             LIMIT 1
             FOR UPDATE`,
            [matchId]
        );

        if (matches.length === 0) {
            await connection.rollback();

            return NextResponse.json({
                success: false,
                message: "Match not found."
            }, { status: 404 });
        }

        const match = matches[0];

        if (match.status !== "IN_PROGRESS") {
            await connection.rollback();

            return NextResponse.json({
                success: false,
                message: "This match is not currently in progress."
            }, { status: 400 });
        }

        // 2. Verify that the requesting player belongs to this match
        if (
            Number(match.player_1_id) !== playerId &&
            Number(match.player_2_id) !== playerId
        ) {
            await connection.rollback();

            return NextResponse.json({
                success: false,
                message: "You are not a participant in this match."
            }, { status: 403 });
        }

        // 3. Identify the computer player
        const [participants] = await connection.execute(
            `SELECT player_id, is_computer
             FROM PLAYER
             WHERE player_id IN (?, ?)`,
            [match.player_1_id, match.player_2_id]
        );

        const bot = participants.find(
            participant => Number(participant.is_computer) === 1
        );

        const botPlayerId = bot
            ? Number(bot.player_id)
            : null;

        // 4. Retrieve the current active turn
        const [turns] = await connection.execute(
            `SELECT
                turn_id,
                turn_number,
                player_id
             FROM \`TURN\`
             WHERE match_id = ?
             AND ended_at IS NULL
             ORDER BY turn_number DESC
             LIMIT 1
             FOR UPDATE`,
            [matchId]
        );

        if (turns.length === 0) {
            await connection.rollback();

            return NextResponse.json({
                success: false,
                message: "No active turn exists for this match."
            }, { status: 400 });
        }

        const currentTurn = turns[0];

        // 5. Verify that it is the requesting player's turn
        if (Number(currentTurn.player_id) !== playerId) {
            await connection.rollback();

            return NextResponse.json({
                success: false,
                message: "It is not your turn."
            }, { status: 403 });
        }

        // 6. End the current player's turn
        await connection.execute(
            `UPDATE \`TURN\`
             SET ended_at = CURRENT_TIMESTAMP
             WHERE turn_id = ?
             AND ended_at IS NULL`,
            [currentTurn.turn_id]
        );

        // Remove effects that expire at the end of this player's turn
        await connection.execute(
            `DELETE FROM MATCH_EFFECT
             WHERE match_id = ?
             AND expires_after_player_id = ?
             AND trigger_type = 'OPPONENT_TURN_END'`,
            [matchId, currentTurn.player_id]
        );

        // 7. Determine the next player
        const nextPlayerId =
            Number(currentTurn.player_id) === Number(match.player_1_id)
                ? Number(match.player_2_id)
                : Number(match.player_1_id);

        // Check whether the next player has taken a turn before
        const [previousTurns] = await connection.execute(
            `SELECT COUNT(*) AS turn_count
             FROM \`TURN\`
             WHERE match_id = ?
             AND player_id = ?`,
            [matchId, nextPlayerId]
        );

        const shouldRotate =
            Number(previousTurns[0].turn_count) > 0;

        let nextTurnNumber =
            Number(currentTurn.turn_number) + 1;

        // 8. Create the next player's turn
        const [newTurnResult] = await connection.execute(
            `INSERT INTO \`TURN\` (
                match_id,
                turn_number,
                player_id
             )
             VALUES (?, ?, ?)`,
            [matchId, nextTurnNumber, nextPlayerId]
        );

        // 9. Process the next player's turn start
        let turnStart = await startPlayerTurn(
            connection,
            matchId,
            nextPlayerId,
            shouldRotate
        );

        let finalNextTurn = {
            turn_id: newTurnResult.insertId,
            turn_number: nextTurnNumber,
            player_id: nextPlayerId
        };

        let botTurnInfo = null;
        let botAction = null;
        let matchCompleted = false;

        // 10. If the next player is the bot, execute its turn
        if (
            botPlayerId !== null &&
            nextPlayerId === botPlayerId
        ) {
            const botTurnId = newTurnResult.insertId;

            // Execute the bot's character action
            botAction = await executeBotTurn(
                connection,
                matchId,
                botTurnId,
                botPlayerId,
                Number(currentTurn.player_id)
            );

            botTurnInfo = {
                turn_id: botTurnId,
                turn_number: nextTurnNumber,
                player_id: botPlayerId,
                action: botAction
            };

            // End the bot's turn automatically
            await connection.execute(
                `UPDATE \`TURN\`
                 SET ended_at = CURRENT_TIMESTAMP
                 WHERE turn_id = ?
                 AND ended_at IS NULL`,
                [botTurnId]
            );

            // Remove effects expiring at the end of the bot's turn
            await connection.execute(
                `DELETE FROM MATCH_EFFECT
                 WHERE match_id = ?
                 AND expires_after_player_id = ?
                 AND trigger_type = 'OPPONENT_TURN_END'`,
                [matchId, botPlayerId]
            );

            // Check whether the bot completed the match
            const [matchStatusRows] = await connection.execute(
                `SELECT status, winner_id
                 FROM MATCHES
                 WHERE match_id = ?`,
                [matchId]
            );

            matchCompleted =
                matchStatusRows[0].status === "COMPLETED";

            if (matchCompleted) {
                finalNextTurn = null;
                turnStart = {
                    activeCharacter: null,
                    drawnCards: [],
                    hand: []
                };
            } else {
                // 11. Start the human's next turn
                const humanPlayerId =
                    Number(currentTurn.player_id);

                const [humanPreviousTurns] =
                    await connection.execute(
                        `SELECT COUNT(*) AS turn_count
                         FROM \`TURN\`
                         WHERE match_id = ?
                         AND player_id = ?`,
                        [matchId, humanPlayerId]
                    );

                const humanShouldRotate =
                    Number(humanPreviousTurns[0].turn_count) > 0;

                nextTurnNumber++;

                const [humanTurnResult] =
                    await connection.execute(
                        `INSERT INTO \`TURN\` (
                            match_id,
                            turn_number,
                            player_id
                         )
                         VALUES (?, ?, ?)`,
                        [
                            matchId,
                            nextTurnNumber,
                            humanPlayerId
                        ]
                    );

                finalNextTurn = {
                    turn_id: humanTurnResult.insertId,
                    turn_number: nextTurnNumber,
                    player_id: humanPlayerId
                };

                turnStart = await startPlayerTurn(
                    connection,
                    matchId,
                    humanPlayerId,
                    humanShouldRotate
                );
            }
        }

        // 12. Prepare the final human-facing turn information
        const activeCharacter = turnStart.activeCharacter;
        const drawnCards = turnStart.drawnCards;
        const updatedHand = turnStart.hand;

        // 13. Commit the complete turn transition
        await connection.commit();

        return NextResponse.json({
            success: true,
            message: botTurnInfo
                ? matchCompleted
                    ? "Bot turn completed. The match has ended."
                    : "Your turn and the bot's turn completed successfully."
                : "Turn ended successfully.",
            data: {
                match_id: matchId,

                previous_turn: {
                    turn_id: currentTurn.turn_id,
                    turn_number: currentTurn.turn_number,
                    player_id: currentTurn.player_id
                },

                bot_turn: botTurnInfo,

                next_turn: finalNextTurn,

                match_status: matchCompleted
                    ? "COMPLETED"
                    : "IN_PROGRESS",

                cooldowns_processed: true,

                cards_drawn: drawnCards.length,

                drawn_card_ids: drawnCards.map(
                    card => card.card_id
                ),

                hand_count: updatedHand.length,

                hand: updatedHand,

                active_character: activeCharacter
                    ? {
                        match_character_id:
                            activeCharacter.match_character_id,
                        card_id: activeCharacter.card_id,
                        position: activeCharacter.position,
                        current_hp: activeCharacter.current_hp,
                        current_light: activeCharacter.current_light,
                        status: activeCharacter.status
                    }
                    : null
            }
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }

        console.error("End turn error:", error);

        return NextResponse.json({
            success: false,
            message: "Unable to end the turn."
        }, { status: 500 });

    } finally {
        if (connection) {
            connection.release();
        }
    }
}
