
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/authorization";
import pool from "@/lib/mysql";

export async function POST(request, { params }) {
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
    let transactionStarted = false;

    try {
        connection = await pool.getConnection();

        await connection.beginTransaction();
        transactionStarted = true;

        // 1. Lock and retrieve the match
        const [matchRows] = await connection.execute(
            `SELECT
                match_id,
                player_1_id,
                player_2_id,
                winner_id,
                status
             FROM MATCHES
             WHERE match_id = ?
             FOR UPDATE`,
            [matchId]
        );

        const match = matchRows[0];

        if (!match) {
            throw Object.assign(new Error("Match not found."), {
                statusCode: 404
            });
        }

        if (match.status !== "IN_PROGRESS") {
            throw Object.assign(
                new Error("This match is no longer in progress."),
                { statusCode: 409 }
            );
        }

        // 2. Identify the requester and opponent
        const isPlayer1 =
            Number(match.player_1_id) === playerId;

        const isPlayer2 =
            Number(match.player_2_id) === playerId;

        if (!isPlayer1 && !isPlayer2) {
            throw Object.assign(
                new Error("You are not a participant in this match."),
                { statusCode: 403 }
            );
        }

        const opponentPlayerId = isPlayer1
            ? Number(match.player_2_id)
            : Number(match.player_1_id);

        // 3. Verify that the requester is human
        // and the opponent is a computer
        const [playerRows] = await connection.execute(
            `SELECT player_id, is_computer
             FROM PLAYER
             WHERE player_id IN (?, ?)
             FOR UPDATE`,
            [playerId, opponentPlayerId]
        );

        const requester = playerRows.find(
            p => Number(p.player_id) === playerId
        );

        const opponent = playerRows.find(
            p => Number(p.player_id) === opponentPlayerId
        );

        if (!requester || !opponent) {
            throw new Error("Match participant information not found.");
        }

        if (Boolean(requester.is_computer)) {
            throw Object.assign(
                new Error("Computer players cannot quit through this endpoint."),
                { statusCode: 403 }
            );
        }

        if (!Boolean(opponent.is_computer)) {
            throw Object.assign(
                new Error("This endpoint currently supports bot matches only."),
                { statusCode: 400 }
            );
        }

        // 4. End the active turn, if one exists
        await connection.execute(
            `UPDATE TURN
             SET ended_at = CURRENT_TIMESTAMP
             WHERE match_id = ?
             AND ended_at IS NULL`,
            [matchId]
        );

        // 5. Complete the match and award victory to the bot
        await connection.execute(
            `UPDATE MATCHES
             SET status = 'COMPLETED',
                 winner_id = ?
             WHERE match_id = ?
             AND status = 'IN_PROGRESS'`,
            [opponentPlayerId, matchId]
        );

        // 6. Commit transaction
        await connection.commit();
        transactionStarted = false;

        return NextResponse.json({
            success: true,
            message: "You have quit the match. The bot wins by default.",
            match_id: matchId,
            match_status: "COMPLETED",
            winner_id: opponentPlayerId,
            winner: "BOT",
            quitter_id: playerId
        });

    } catch (error) {
        if (transactionStarted && connection) {
            await connection.rollback();
        }

        console.error("Quit match error:", error);

        return NextResponse.json(
            {
                error: error.message || "Failed to quit match."
            },
            { status: error.statusCode || 500 }
        );

    } finally {
        if (connection) {
            connection.release();
        }
    }
}
