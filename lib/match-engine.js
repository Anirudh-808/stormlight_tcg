import clientPromise from "@/lib/mongodb";

/**
 * Select the strongest affordable damaging move
 * for a character using their MongoDB card details.
 */
export async function getStrongestAffordableMove(
    cardId,
    currentLight
) {
    const client = await clientPromise;

    const db = client.db(process.env.MONGODB_DB);

    const characterDetails = await db
        .collection("card_details")
        .findOne({ card_id: Number(cardId) });

    if (!characterDetails || !characterDetails.moves) {
        throw new Error(
            `Card details not found for character card ${cardId}`
        );
    }

    const affordableMoves = characterDetails.moves.filter(
        (move) =>
            move.light_cost <= currentLight &&
            move.damage > 0 &&
            ["ATTACK", "SPECIAL"].includes(move.type)
    );

    if (affordableMoves.length === 0) {
        return null;
    }

    // Highest damage first; lowest Light cost breaks ties
    affordableMoves.sort((a, b) => {
        if (b.damage !== a.damage) {
            return b.damage - a.damage;
        }

        return a.light_cost - b.light_cost;
    });

    return affordableMoves[0];
}

/**
 * Execute a character's selected attack.
 *
 * Handles:
 * 1. Light deduction.
 * 2. Attack boosts.
 * 3. Target defence.
 * 4. HP reduction and defeat.
 * 5. Shardbearer inactivity at zero Light.
 * 6. GAME_ACTION recording.
 *
 * Must be called inside an existing transaction.
 */
export async function executeCharacterAttack(
    connection,
    matchId,
    turnId,
    playerId,
    activeCharacter,
    targetCharacter,
    move
) {
    // 1. Lock and retrieve the attacking character
    const [attackerRows] = await connection.execute(
        `SELECT
            mc.match_character_id,
            mc.card_id,
            mc.current_light,
            mc.status,
            cc.character_type,
            cc.recovery_turns
         FROM MATCH_CHARACTER mc
         JOIN CHARACTER_CARD cc ON cc.card_id = mc.card_id
         WHERE mc.match_character_id = ?
         AND mc.match_id = ?
         AND mc.player_id = ?
         FOR UPDATE`,
        [
            activeCharacter.match_character_id,
            matchId,
            playerId
        ]
    );

    const attacker = attackerRows[0];

    if (!attacker || attacker.status !== "ACTIVE") {
        throw new Error("Attacking character is not active.");
    }

    if (attacker.current_light < move.light_cost) {
        throw new Error("Insufficient Light for this move.");
    }

    // 2. Lock and retrieve the target character
    const [targetRows] = await connection.execute(
        `SELECT
            match_character_id,
            player_id,
            current_hp,
            status
         FROM MATCH_CHARACTER
         WHERE match_character_id = ?
         AND match_id = ?
         FOR UPDATE`,
        [
            targetCharacter.match_character_id,
            matchId
        ]
    );

    const target = targetRows[0];

    if (!target || target.status !== "ACTIVE") {
        throw new Error("Target character is not active.");
    }

    // 3. Retrieve applicable attack boosts
    const [boostRows] = await connection.execute(
        `SELECT match_effect_id, effect_value
         FROM MATCH_EFFECT
         WHERE match_id = ?
         AND owner_player_id = ?
         AND source_match_character_id = ?
         AND effect_type = 'ATTACK_BOOST'
         AND trigger_type = 'NEXT_ATTACK'
         FOR UPDATE`,
        [
            matchId,
            playerId,
            attacker.match_character_id
        ]
    );

    const attackBoost = boostRows.reduce(
        (total, effect) =>
            total + Number(effect.effect_value),
        0
    );

    // 4. Retrieve defensive effects on the target
    const [defenseRows] = await connection.execute(
        `SELECT match_effect_id, effect_value
         FROM MATCH_EFFECT
         WHERE match_id = ?
         AND target_match_character_id = ?
         AND effect_type = 'DEFENSE'
         FOR UPDATE`,
        [
            matchId,
            target.match_character_id
        ]
    );

    const defense = defenseRows.reduce(
        (total, effect) =>
            total + Number(effect.effect_value),
        0
    );

    // 5. Calculate actual damage
    const rawDamage =
        Number(move.damage) + attackBoost;

    const actualDamage = Math.max(
        0,
        rawDamage - defense
    );

    const remainingHP = Math.max(
        0,
        Number(target.current_hp) - actualDamage
    );

    const targetDefeated = remainingHP === 0;

    // 6. Deduct Light from the attacking character
    const remainingLight =
        Number(attacker.current_light) -
        Number(move.light_cost);

    const shardbearerInactive =
        attacker.character_type === "SHARDBEARER" &&
        remainingLight === 0;

    await connection.execute(
        `UPDATE MATCH_CHARACTER
         SET
            current_light = ?,
            status = ?,
            recovery_turns_remaining = ?
         WHERE match_character_id = ?`,
        [
            remainingLight,
            shardbearerInactive ? "INACTIVE" : "ACTIVE",
            shardbearerInactive
                ? Number(attacker.recovery_turns || 0)
                : 0,
            attacker.match_character_id
        ]
    );

    // 7. Apply damage to the target
    await connection.execute(
        `UPDATE MATCH_CHARACTER
         SET
            current_hp = ?,
            status = ?
         WHERE match_character_id = ?`,
        [
            remainingHP,
            targetDefeated ? "DEFEATED" : "ACTIVE",
            target.match_character_id
        ]
    );

    // 8. Consume attack boosts after the attack
    for (const effect of boostRows) {
        await connection.execute(
            `DELETE FROM MATCH_EFFECT
             WHERE match_effect_id = ?`,
            [effect.match_effect_id]
        );
    }

    // 9. Record the attack
    const statusApplied = [];

    if (attackBoost > 0) {
        statusApplied.push("ATTACK_BOOST");
    }

    if (defense > 0) {
        statusApplied.push("DEFENSE_APPLIED");
    }

    if (targetDefeated) {
        statusApplied.push("DEFEATED");
    }

    if (shardbearerInactive) {
        statusApplied.push("SHARDBEARER_INACTIVE");
    }

    await connection.execute(
        `INSERT INTO GAME_ACTION (
            turn_id,
            source_match_character_id,
            target_match_character_id,
            action_type,
            value,
            status_applied
         )
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
            turnId,
            attacker.match_character_id,
            target.match_character_id,
            move.type,
            actualDamage,
            statusApplied.length > 0
                ? statusApplied.join(", ")
                : null
        ]
    );

    // 10. Check whether this attack ended the match
    let matchCompleted = false;

    if (targetDefeated) {
        matchCompleted = await checkAndCompleteMatch(
            connection,
            matchId,
            playerId,
            target.player_id
        );
    }

    return {
        moveName: move.name,
        damage: actualDamage,
        remainingLight,
        remainingHP,
        targetDefeated,
        shardbearerInactive,
        attackBoost,
        defense,
        matchCompleted
    };
}

// Execute a defensive SPECIAL move
export async function executeCharacterSpecial(
    connection,
    matchId,
    turnId,
    playerId,
    opponentPlayerId,
    activeCharacter
) {
    // 1. Lock the active character and retrieve its current stats
    const [characterRows] = await connection.execute(
        `SELECT
            mc.match_character_id,
            mc.card_id,
            mc.current_light,
            mc.status,
            cc.character_type,
            cc.recovery_turns
         FROM MATCH_CHARACTER mc
         JOIN CHARACTER_CARD cc ON mc.card_id = cc.card_id
         WHERE mc.match_character_id = ?
         AND mc.match_id = ?
         AND mc.player_id = ?
         FOR UPDATE`,
        [
            activeCharacter.match_character_id,
            matchId,
            playerId
        ]
    );

    if (
        characterRows.length === 0 ||
        characterRows[0].status !== "ACTIVE"
    ) {
        return null;
    }

    const character = characterRows[0];

    // 2. Retrieve the character's move and effect definitions from MongoDB
    const mongoClient = await clientPromise;
    const mongoDb = mongoClient.db(process.env.MONGODB_DB);

    const cardDetails = await mongoDb
        .collection("card_details")
        .findOne({ card_id: Number(character.card_id) });

    if (!cardDetails) {
        throw new Error("Character details not found in MongoDB.");
    }

    // Select the first affordable, zero-damage SPECIAL move
    const specialMove = cardDetails.moves?.find(
        move =>
            move.type === "SPECIAL" &&
            Number(move.damage) === 0 &&
            Number(move.light_cost) <= Number(character.current_light)
    );

    if (!specialMove) {
        return null;
    }

    // Use the first DEFENSE effect in the character's effects array
    const defenseEffect = cardDetails.effects?.find(
        effect => effect.effect_type === "DEFENSE"
    );

    if (!defenseEffect || Number(defenseEffect.value) <= 0) {
        throw new Error("No valid DEFENSE effect found for this SPECIAL move.");
    }

    const lightCost = Number(specialMove.light_cost);
    const defenseValue = Number(defenseEffect.value);
    const remainingLight = Number(character.current_light) - lightCost;

    // 3. Deduct Light and handle Shardbearer exhaustion
    if (
        character.character_type === "SHARDBEARER" &&
        remainingLight === 0
    ) {
        await connection.execute(
            `UPDATE MATCH_CHARACTER
             SET
                current_light = 0,
                status = 'INACTIVE',
                recovery_turns_remaining = ?
             WHERE match_character_id = ?`,
            [
                Number(character.recovery_turns || 0),
                character.match_character_id
            ]
        );
    } else {
        await connection.execute(
            `UPDATE MATCH_CHARACTER
             SET current_light = ?
             WHERE match_character_id = ?`,
            [
                remainingLight,
                character.match_character_id
            ]
        );
    }

    // 4. Apply the defensive effect until the opponent's turn ends
    await connection.execute(
        `INSERT INTO MATCH_EFFECT (
            match_id,
            owner_player_id,
            source_match_character_id,
            target_match_character_id,
            created_turn_id,
            effect_type,
            effect_value,
            trigger_type,
            expires_after_player_id
        )
        VALUES (?, ?, ?, ?, ?, 'DEFENSE', ?, 'OPPONENT_TURN_END', ?)`,
        [
            matchId,
            playerId,
            character.match_character_id,
            character.match_character_id,
            turnId,
            defenseValue,
            opponentPlayerId
        ]
    );

    // 5. Record the SPECIAL move in GAME_ACTION
    await connection.execute(
        `INSERT INTO GAME_ACTION (
            turn_id,
            source_match_character_id,
            target_match_character_id,
            action_type,
            value,
            status_applied
        )
        VALUES (?, ?, ?, 'SPECIAL', ?, 'DEFENSE')`,
        [
            turnId,
            character.match_character_id,
            character.match_character_id,
            defenseValue
        ]
    );

    return {
        moveName: specialMove.name,
        lightSpent: lightCost,
        remainingLight,
        defenseApplied: defenseValue,
        characterInactive:
            character.character_type === "SHARDBEARER" &&
            remainingLight === 0
    };
}

/**
 * Execute the bot's character action for the current turn.
 *
 * Priority:
 * 1. Use the strongest affordable damaging move.
 * 2. If no damaging move is affordable, use a defensive SPECIAL.
 * 3. If neither is available, take no action.
 *
 * Must be called inside an existing transaction.
 */

export async function executeBotTurn(
    connection,
    matchId,
    turnId,
    botPlayerId,
    opponentPlayerId
) {
    // 1. Retrieve the bot's active character
    const [botCharacters] = await connection.execute(
        `SELECT
            mc.match_character_id,
            mc.card_id,
            mc.current_light,
            mc.current_hp,
            mc.status,
            cc.base_hp
        FROM MATCH_CHARACTER mc
        JOIN CHARACTER_CARD cc
            ON mc.card_id = cc.card_id
        WHERE mc.match_id = ?
        AND mc.player_id = ?
        AND mc.status = 'ACTIVE'
        LIMIT 1
        FOR UPDATE`,
        [matchId, botPlayerId]
    );

    const botCharacter = botCharacters[0];
    console.log("BOT ACTIVE CHARACTER:", botCharacter);

    if (!botCharacter) {
        return {
            actionType: "NO_ACTION",
            reason: "Bot has no active character."
        };
    }

    // 2. Retrieve the opponent's active character
    const [opponentCharacters] = await connection.execute(
        `SELECT
            match_character_id,
            card_id,
            current_light,
            current_hp,
            status
         FROM MATCH_CHARACTER
         WHERE match_id = ?
         AND player_id = ?
         AND status = 'ACTIVE'
         LIMIT 1
         FOR UPDATE`,
        [matchId, opponentPlayerId]
    );

    const opponentCharacter = opponentCharacters[0];
    console.log("BOT OPPONENT CHARACTER:", opponentCharacter);

    if (!opponentCharacter) {
        return {
            actionType: "NO_ACTION",
            reason: "Opponent has no active character."
        };
    }

    // 3. Calculate the bot character's HP percentage
    const hpPercentage =
        (botCharacter.current_hp / botCharacter.base_hp) * 100;

    // 4. If HP is 50% or below, prioritize defensive SPECIAL
    if (hpPercentage <= 50) {
        const specialResult = await executeCharacterSpecial(
            connection,
            matchId,
            turnId,
            botPlayerId,
            opponentPlayerId,
            botCharacter
        );

        if (specialResult) {
            return {
                actionType: "SPECIAL",
                reason: "Bot prioritized defense due to low HP.",
                result: specialResult
            };
        }
    }

    // 5. Otherwise, find the strongest affordable damaging move
    const bestMove = await getStrongestAffordableMove(
        botCharacter.card_id,
        botCharacter.current_light
    );

    if (bestMove) {
        const attackResult = await executeCharacterAttack(
            connection,
            matchId,
            turnId,
            botPlayerId,
            botCharacter,
            opponentCharacter,
            bestMove
        );

        return {
            actionType: bestMove.type,
            result: attackResult
        };
    }

    // 6. If no damaging move is affordable, try defensive SPECIAL
    const specialResult = await executeCharacterSpecial(
        connection,
        matchId,
        turnId,
        botPlayerId,
        opponentPlayerId,
        botCharacter
    );

    if (specialResult) {
        return {
            actionType: "SPECIAL",
            result: specialResult
        };
    }

    // 7. No affordable move is available
    return {
        actionType: "NO_ACTION",
        reason: "Bot has no affordable character move."
    };
}

/**
 * Check whether a player has defeated all opposing characters.
 * If so, complete the match and award 100 Spheres.
 *
 * Must be called inside an existing transaction.
 */
export async function checkAndCompleteMatch(
    connection,
    matchId,
    winnerId,
    loserId
) {
    // 1. Check how many characters the losing player has remaining
    const [remainingRows] = await connection.execute(
        `SELECT COUNT(*) AS remaining_characters
         FROM MATCH_CHARACTER
         WHERE match_id = ?
         AND player_id = ?
         AND status <> 'DEFEATED'`,
        [matchId, loserId]
    );

    const remainingCharacters = Number(
        remainingRows[0].remaining_characters
    );

    if (remainingCharacters > 0) {
        return false;
    }

    // 2. Complete the match
    const [matchResult] = await connection.execute(
        `UPDATE matches
         SET
            status = 'COMPLETED',
            winner_id = ?,
            ended_at = CURRENT_TIMESTAMP
         WHERE match_id = ?
         AND status = 'IN_PROGRESS'`,
        [winnerId, matchId]
    );

    // Prevent duplicate rewards
    if (matchResult.affectedRows !== 1) {
        return false;
    }

    // 3. Configure the Sphere transaction trigger
    try {
        await connection.execute(
            `SET
                @sphere_txn_type = 'MATCH_REWARD',
                @sphere_txn_description = ?`,
            [`Won match ${matchId}`]
        );

        // 4. Award 100 Spheres
        // The database trigger automatically records the transaction
        await connection.execute(
            `UPDATE PLAYER
             SET spheres = spheres + 100
             WHERE player_id = ?`,
            [winnerId]
        );
    } finally {
        // Reset session variables before returning the connection
        await connection.execute(
            `SET
                @sphere_txn_type = NULL,
                @sphere_txn_description = NULL`
        );
    }

    return true;
}

/**
 * Rotate a player's active character when their turn begins.
 *
 * shouldRotate = false:
 *     Keep the original active character on their first turn.
 *
 * shouldRotate = true:
 *     Move to the next eligible character.
 */
export async function rotateCharacter(
    connection,
    matchId,
    playerId,
    shouldRotate
) {
    // Find the currently active character
    const [activeCharacters] = await connection.execute(
        `SELECT
            match_character_id,
            card_id,
            position,
            current_hp,
            current_light,
            status
         FROM MATCH_CHARACTER
         WHERE match_id = ?
         AND player_id = ?
         AND status = 'ACTIVE'
         LIMIT 1
         FOR UPDATE`,
        [matchId, playerId]
    );

    const currentActive = activeCharacters[0] || null;

    // Preserve the initial active character on the first turn
    if (!shouldRotate && currentActive) {
        return currentActive;
    }

    const currentPosition = currentActive
        ? currentActive.position
        : 0;

    // Find the next available character, cycling back to position 1
    const [availableCharacters] = await connection.execute(
        `SELECT
            match_character_id,
            card_id,
            position,
            current_hp,
            current_light,
            status
         FROM MATCH_CHARACTER
         WHERE match_id = ?
         AND player_id = ?
         AND status = 'AVAILABLE'
         AND current_hp > 0
         AND recovery_turns_remaining = 0
         ORDER BY
            CASE
                WHEN position > ? THEN 0
                ELSE 1
            END,
            position ASC
         LIMIT 1
         FOR UPDATE`,
        [matchId, playerId, currentPosition]
    );

    const nextCharacter = availableCharacters[0] || null;

    // No eligible replacement: retain the current character
    if (!nextCharacter) {
        return currentActive;
    }

    // Deactivate the previous active character
    if (currentActive) {
        await connection.execute(
            `UPDATE MATCH_CHARACTER
             SET status = 'AVAILABLE'
             WHERE match_character_id = ?
             AND status = 'ACTIVE'`,
            [currentActive.match_character_id]
        );
    }

    // Activate the next character
    await connection.execute(
        `UPDATE MATCH_CHARACTER
         SET status = 'ACTIVE'
         WHERE match_character_id = ?
         AND status = 'AVAILABLE'`,
        [nextCharacter.match_character_id]
    );

    return {
        ...nextCharacter,
        status: "ACTIVE"
    };
}

/**
 * Process everything that happens when a player's turn begins:
 * 1. Rotate their active character if required.
 * 2. Reduce their card cooldowns.
 * 3. Return expired cards to the bottom of their draw pile.
 * 4. Draw up to 2 cards if their hand contains fewer than 5.
 * 5. Retrieve their updated hand.
 *
 * This function must be called inside an existing transaction.
 */
export async function startPlayerTurn(
    connection,
    matchId,
    playerId,
    shouldRotate
) {
    // 0. Update recovery timers for inactive characters
    await connection.execute(
        `UPDATE MATCH_CHARACTER
        SET
            status = CASE
                WHEN recovery_turns_remaining = 1
                THEN 'AVAILABLE'
                ELSE status
            END,
            recovery_turns_remaining = recovery_turns_remaining - 1
        WHERE match_id = ?
        AND player_id = ?
        AND status = 'INACTIVE'
        AND recovery_turns_remaining > 0`,
        [matchId, playerId]
    );

    // 1. Rotate the active character
    // 1. Determine whether this player is a bot
    const [playerRows] = await connection.execute(
        `SELECT is_computer
        FROM PLAYER
        WHERE player_id = ?`,
        [playerId]
    );

    const isBot = Boolean(playerRows[0]?.is_computer);

    // 2. Decide whether character rotation should happen
    let shouldRotateCharacter = shouldRotate;

    // Bots retain their active character when HP is 50% or below
    if (isBot && shouldRotate) {
        const [activeRows] = await connection.execute(
            `SELECT
                mc.current_hp,
                cc.base_hp
            FROM MATCH_CHARACTER mc
            JOIN CHARACTER_CARD cc
                ON mc.card_id = cc.card_id
            WHERE mc.match_id = ?
            AND mc.player_id = ?
            AND mc.status = 'ACTIVE'
            LIMIT 1
            FOR UPDATE`,
            [matchId, playerId]
        );

        const activeBotCharacter = activeRows[0];

        if (
            activeBotCharacter &&
            Number(activeBotCharacter.base_hp) > 0
        ) {
            const hpPercentage =
                (Number(activeBotCharacter.current_hp) /
                Number(activeBotCharacter.base_hp)) * 100;

            if (hpPercentage <= 50) {
                shouldRotateCharacter = false;
            }
        }
    }

    // 3. Rotate the character if required
    const activeCharacter = await rotateCharacter(
        connection,
        matchId,
        playerId,
        shouldRotateCharacter
    );

    // 2. Find cards whose cooldown expires on this turn
    const [expiredCards] = await connection.execute(
        `SELECT match_card_id
         FROM MATCH_CARD
         WHERE match_id = ?
         AND player_id = ?
         AND zone = 'COOLDOWN'
         AND cooldown_turns_remaining = 1
         FOR UPDATE`,
        [matchId, playerId]
    );

    // 3. Find the current last position in the draw pile
    const [maxOrderRows] = await connection.execute(
        `SELECT COALESCE(MAX(draw_order), 0) AS max_order
         FROM MATCH_CARD
         WHERE match_id = ?
         AND player_id = ?
         AND zone = 'DRAW_PILE'`,
        [matchId, playerId]
    );

    let nextDrawOrder =
        Number(maxOrderRows[0].max_order) + 1;

    // Return expired cards to the bottom of the draw pile
    for (const card of expiredCards) {
        await connection.execute(
            `UPDATE MATCH_CARD
             SET
                zone = 'DRAW_PILE',
                cooldown_turns_remaining = 0,
                draw_order = ?
             WHERE match_card_id = ?
             AND zone = 'COOLDOWN'`,
            [nextDrawOrder, card.match_card_id]
        );

        nextDrawOrder++;
    }

    // 4. Decrement cooldowns that have not expired yet
    await connection.execute(
        `UPDATE MATCH_CARD
         SET cooldown_turns_remaining =
             cooldown_turns_remaining - 1
         WHERE match_id = ?
         AND player_id = ?
         AND zone = 'COOLDOWN'
         AND cooldown_turns_remaining > 1`,
        [matchId, playerId]
    );

    // 5. Check the player's hand size
    const [handCountRows] = await connection.execute(
        `SELECT COUNT(*) AS hand_count
         FROM MATCH_CARD
         WHERE match_id = ?
         AND player_id = ?
         AND zone = 'HAND'`,
        [matchId, playerId]
    );

    const handCount = Number(handCountRows[0].hand_count);

    let drawnCards = [];

    // 6. Draw up to 2 cards if hand size is below 5
    if (handCount < 5) {
        const [drawPile] = await connection.execute(
            `SELECT match_card_id, card_id
             FROM MATCH_CARD
             WHERE match_id = ?
             AND player_id = ?
             AND zone = 'DRAW_PILE'
             ORDER BY draw_order ASC, match_card_id ASC
             LIMIT 2
             FOR UPDATE`,
            [matchId, playerId]
        );

        for (const card of drawPile) {
            await connection.execute(
                `UPDATE MATCH_CARD
                 SET
                    zone = 'HAND',
                    draw_order = 0
                 WHERE match_card_id = ?
                 AND zone = 'DRAW_PILE'`,
                [card.match_card_id]
            );
        }

        drawnCards = drawPile;
    }

    // 7. Retrieve the updated hand
    const [updatedHand] = await connection.execute(
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
        [matchId, playerId]
    );

    return {
        activeCharacter,
        drawnCards,
        hand: updatedHand
    };
}
