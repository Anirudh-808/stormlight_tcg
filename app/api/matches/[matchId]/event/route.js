
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/authorization";
import pool from "@/lib/mysql";
import clientPromise from "@/lib/mongodb";

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

    let body;

    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON request body." },
            { status: 400 }
        );
    }

    const matchCardId = Number(body.match_card_id);

    if (!Number.isInteger(matchCardId) || matchCardId <= 0) {
        return NextResponse.json(
            { error: "A valid match_card_id is required." },
            { status: 400 }
        );
    }

    let connection;
    let transactionStarted = false;

    try {
        connection = await pool.getConnection();

        await connection.beginTransaction();
        transactionStarted = true;

        // 1. Lock and validate match
        const [matchRows] = await connection.execute(
            `SELECT match_id, player_1_id, player_2_id, status
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

        const isParticipant =
            Number(match.player_1_id) === playerId ||
            Number(match.player_2_id) === playerId;

        if (!isParticipant) {
            throw Object.assign(
                new Error("You are not a participant in this match."),
                { statusCode: 403 }
            );
        }

        // 2. Verify active turn
        const [turnRows] = await connection.execute(
            `SELECT turn_id, player_id
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
            throw Object.assign(
                new Error("No active turn exists."),
                { statusCode: 409 }
            );
        }

        if (Number(currentTurn.player_id) !== playerId) {
            throw Object.assign(
                new Error("It is not your turn."),
                { statusCode: 403 }
            );
        }

        // 3. Retrieve the event card from the player's hand
        const [cardRows] = await connection.execute(
            `SELECT
                mc.match_card_id,
                mc.card_id,
                eh.event_helper_type,
                eh.duration_turns,
                eh.cooldown_turns
             FROM MATCH_CARD mc
             JOIN EVENT_HELPER eh
                ON eh.card_id = mc.card_id
             WHERE mc.match_card_id = ?
             AND mc.match_id = ?
             AND mc.player_id = ?
             AND mc.zone = 'HAND'
             FOR UPDATE`,
            [matchCardId, matchId, playerId]
        );

        const eventCard = cardRows[0];

        if (!eventCard) {
            throw Object.assign(
                new Error("This card is not available in your hand."),
                { statusCode: 404 }
            );
        }

        if (eventCard.event_helper_type !== "EVENT") {
            throw Object.assign(
                new Error("This endpoint currently supports EVENT cards only."),
                { statusCode: 400 }
            );
        }

        // 4. Retrieve the active character
        const [characterRows] = await connection.execute(
            `SELECT
                mc.match_character_id,
                mc.current_light,
                cc.max_light
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
            throw Object.assign(
                new Error("You do not have an active character."),
                { statusCode: 409 }
            );
        }

        // 5. Retrieve the event effect from MongoDB
        const mongoClient = await clientPromise;
        const mongoDb = mongoClient.db(process.env.MONGODB_DB);

        const cardDetails = await mongoDb
            .collection("card_details")
            .findOne({
                card_id: Number(eventCard.card_id)
            });

        if (!cardDetails || !Array.isArray(cardDetails.effects)) {
            throw new Error("Event effect definitions could not be found.");
        }

        const resourceEffect = cardDetails.effects.find(
            effect => effect.effect_type === "RESOURCE"
        );

        if (
            !resourceEffect ||
            !Number.isFinite(Number(resourceEffect.value)) ||
            Number(resourceEffect.value) <= 0
        ) {
            throw new Error("Invalid resource effect definition.");
        }

        // 6. Calculate the actual Light restoration
        const oldLight = Number(activeCharacter.current_light);
        const maxLight = Number(activeCharacter.max_light);
        const requestedRestore = Number(resourceEffect.value);

        const newLight = Math.min(
            maxLight,
            oldLight + requestedRestore
        );

        const restoredLight = newLight - oldLight;

        if (restoredLight <= 0) {
            throw Object.assign(
                new Error("Your active character already has maximum Light."),
                { statusCode: 409 }
            );
        }

        // 7. Apply the resource effect
        await connection.execute(
            `UPDATE MATCH_CHARACTER
             SET current_light = ?
             WHERE match_character_id = ?`,
            [newLight, activeCharacter.match_character_id]
        );

        // 8. Move the event card into cooldown
        await connection.execute(
            `UPDATE MATCH_CARD
             SET zone = 'COOLDOWN',
                 cooldown_turns_remaining = ?
             WHERE match_card_id = ?`,
            [eventCard.cooldown_turns, matchCardId]
        );

        // 9. Record the event action
        await connection.execute(
            `INSERT INTO GAME_ACTION (
                turn_id,
                source_match_character_id,
                target_match_character_id,
                action_type,
                value,
                status_applied
            )
            VALUES (?, ?, NULL, 'EVENT', ?, 'LIGHT_RESTORE')`,
            [
                currentTurn.turn_id,
                activeCharacter.match_character_id,
                restoredLight
            ]
        );

        // 10. Commit transaction
        await connection.commit();
        transactionStarted = false;

        return NextResponse.json({
            success: true,
            message: "Event card played successfully.",
            event: {
                card_id: Number(eventCard.card_id),
                card_name: "Stormlight Surge",
                effect: "LIGHT_RESTORE",
                light_restored: restoredLight,
                previous_light: oldLight,
                current_light: newLight,
                max_light: maxLight,
                cooldown_turns: Number(eventCard.cooldown_turns),
                duration_turns: Number(eventCard.duration_turns)
            },
            match_id: matchId,
            turn_id: currentTurn.turn_id
        });

    } catch (error) {
        if (transactionStarted && connection) {
            await connection.rollback();
        }

        console.error("Event card error:", error);

        return NextResponse.json(
            {
                error: error.message || "Failed to play event card."
            },
            { status: error.statusCode || 500 }
        );

    } finally {
        if (connection) {
            connection.release();
        }
    }
}
