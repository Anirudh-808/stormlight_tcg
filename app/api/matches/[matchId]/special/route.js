
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/authorization";
import pool from "@/lib/mysql";
import { executeCharacterSpecial } from "@/lib/match-engine";

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

    if (!Number.isInteger(matchId) || matchId <= 0) {
        return NextResponse.json(
            { error: "Invalid match ID." },
            { status: 400 }
        );
    }

    let connection;
    let transactionStarted = false;

    try {
        connection = await pool.getConnection();

        await connection.beginTransaction();
        transactionStarted = true;

        // 1. Lock the match and verify its status
        const [matchRows] = await connection.execute(
            `SELECT
                match_id,
                player_1_id,
                player_2_id,
                status
             FROM matches
             WHERE match_id = ?
             FOR UPDATE`,
            [matchId]
        );

        const match = matchRows[0];

        if (!match) {
            await connection.rollback();
            transactionStarted = false;

            return NextResponse.json(
                { error: "Match not found." },
                { status: 404 }
            );
        }

        if (match.status !== "IN_PROGRESS") {
            await connection.rollback();
            transactionStarted = false;

            return NextResponse.json(
                { error: "This match is no longer in progress." },
                { status: 409 }
            );
        }

        // 2. Verify that the requester belongs to this match
        const isPlayer1 =
            Number(match.player_1_id) === playerId;

        const isPlayer2 =
            Number(match.player_2_id) === playerId;

        if (!isPlayer1 && !isPlayer2) {
            await connection.rollback();
            transactionStarted = false;

            return NextResponse.json(
                { error: "You are not a participant in this match." },
                { status: 403 }
            );
        }

        const opponentPlayerId = isPlayer1
            ? Number(match.player_2_id)
            : Number(match.player_1_id);

        // 3. Retrieve and lock the current active turn
        const [turnRows] = await connection.execute(
            `SELECT
                turn_id,
                turn_number,
                player_id
             FROM TURN
             WHERE match_id = ?
             AND ended_at IS NULL
             ORDER BY turn_number DESC
             LIMIT 1
             FOR UPDATE`,
            [matchId]
        );

        const currentTurn = turnRows[0];

        if (!currentTurn) {
            await connection.rollback();
            transactionStarted = false;

            return NextResponse.json(
                { error: "No active turn exists for this match." },
                { status: 409 }
            );
        }

        if (Number(currentTurn.player_id) !== playerId) {
            await connection.rollback();
            transactionStarted = false;

            return NextResponse.json(
                { error: "It is not your turn." },
                { status: 403 }
            );
        }

        // 4. Check whether the player has already used their character move
        const [actionRows] = await connection.execute(
            `SELECT COUNT(*) AS move_count
             FROM GAME_ACTION
             WHERE turn_id = ?
             AND action_type IN ('ATTACK', 'SPECIAL')`,
            [currentTurn.turn_id]
        );

        if (Number(actionRows[0].move_count) > 0) {
            await connection.rollback();
            transactionStarted = false;

            return NextResponse.json(
                {
                    error: "You have already used your character move this turn."
                },
                { status: 409 }
            );
        }

        // 5. Retrieve and lock the player's active character
        const [characterRows] = await connection.execute(
            `SELECT
                mc.match_character_id,
                mc.card_id,
                mc.current_light,
                mc.status,
                cc.character_type,
                cc.recovery_turns
             FROM MATCH_CHARACTER mc
             JOIN CHARACTER_CARD cc
                ON cc.card_id = mc.card_id
             WHERE mc.match_id = ?
             AND mc.player_id = ?
             AND mc.status = 'ACTIVE'
             LIMIT 1
             FOR UPDATE`,
            [matchId, playerId]
        );

        const activeCharacter = characterRows[0];

        if (!activeCharacter) {
            await connection.rollback();
            transactionStarted = false;

            return NextResponse.json(
                { error: "You do not have an active character." },
                { status: 409 }
            );
        }

        // 6. Execute the defensive SPECIAL move
        const specialResult = await executeCharacterSpecial(
            connection,
            matchId,
            currentTurn.turn_id,
            playerId,
            opponentPlayerId,
            activeCharacter
        );

        if (!specialResult) {
            await connection.rollback();
            transactionStarted = false;

            return NextResponse.json(
                {
                    error: "Your active character has no affordable defensive SPECIAL move."
                },
                { status: 400 }
            );
        }

        // 7. Commit all changes
        await connection.commit();
        transactionStarted = false;

        // 8. Return the SPECIAL result
        return NextResponse.json({
            success: true,
            match_id: matchId,
            turn_id: currentTurn.turn_id,
            special: specialResult,
            match_status: "IN_PROGRESS"
        });

    } catch (error) {
        if (transactionStarted && connection) {
            await connection.rollback();
        }

        console.error("Character SPECIAL error:", error);

        return NextResponse.json(
            {
                error: error.message || "Failed to execute SPECIAL move."
            },
            { status: 500 }
        );

    } finally {
        if (connection) {
            connection.release();
        }
    }
}
