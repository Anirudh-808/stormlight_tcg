
import pool from "@/lib/mysql";
import bcrypt from "bcryptjs";

const STARTER_CARDS = [
    { card_id: 1, quantity: 1 },
    { card_id: 2, quantity: 1 },
    { card_id: 3, quantity: 1 },
    { card_id: 4, quantity: 3 },
    { card_id: 5, quantity: 2 },
    { card_id: 6, quantity: 2 },
    { card_id: 7, quantity: 3 },
    { card_id: 8, quantity: 3 }
];

export async function POST(request) {
    let connection;

    try {
        // Read request body
        let body;

        try {
            body = await request.json();
        } catch {
            return Response.json({
                success: false,
                message: "Invalid JSON request body.",
                error: {
                    code: "VALIDATION_ERROR",
                    details: null
                }
            }, { status: 400 });
        }

        const { username, email, password } = body;

        // Validate required fields
        if (
            typeof username !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string" ||
            !username.trim() ||
            !email.trim() ||
            !password
        ) {
            return Response.json({
                success: false,
                message: "Username, email and password are required.",
                error: {
                    code: "VALIDATION_ERROR",
                    details: null
                }
            }, { status: 400 });
        }

        const cleanUsername = username.trim();
        const cleanEmail = email.trim().toLowerCase();

        if (cleanUsername.length > 50) {
            return Response.json({
                success: false,
                message: "Username must not exceed 50 characters.",
                error: {
                    code: "VALIDATION_ERROR",
                    details: null
                }
            }, { status: 400 });
        }

        if (
            cleanEmail.length > 100 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
        ) {
            return Response.json({
                success: false,
                message: "Please provide a valid email address.",
                error: {
                    code: "VALIDATION_ERROR",
                    details: null
                }
            }, { status: 400 });
        }

        if (password.length < 8) {
            return Response.json({
                success: false,
                message: "Password must contain at least 8 characters.",
                error: {
                    code: "VALIDATION_ERROR",
                    details: null
                }
            }, { status: 400 });
        }

        // Hash password before storing it
        const passwordHash = await bcrypt.hash(password, 12);

        // Start MySQL transaction
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Create player account
        const [playerResult] = await connection.execute(
            `INSERT INTO PLAYER
                (username, email, password_hash, role, is_computer)
             VALUES (?, ?, ?, 'PLAYER', 0)`,
            [cleanUsername, cleanEmail, passwordHash]
        );

        const playerId = playerResult.insertId;

        // Prepare starter collection records
        const placeholders = STARTER_CARDS
            .map(() => "(?, ?, ?)")
            .join(", ");

        const values = STARTER_CARDS.flatMap(card => [
            playerId,
            card.card_id,
            card.quantity
        ]);

        // Insert all starter cards
        await connection.execute(
            `INSERT INTO PLAYER_CARD
                (player_id, card_id, quantity)
             VALUES ${placeholders}`,
            values
        );

        // Commit account and collection together
        await connection.commit();

        return Response.json({
            success: true,
            message: "Account created successfully.",
            data: {
                player: {
                    player_id: playerId,
                    username: cleanUsername,
                    email: cleanEmail,
                    spheres: 0
                },
                starter_collection: {
                    distinct_cards: STARTER_CARDS.length,
                    total_cards: STARTER_CARDS.reduce(
                        (total, card) => total + card.quantity,
                        0
                    )
                }
            }
        }, { status: 201 });

    } catch (error) {
        // Undo any incomplete database changes
        if (connection) {
            await connection.rollback();
        }

        console.error("Registration error:", error);

        if (error.code === "ER_DUP_ENTRY") {
            return Response.json({
                success: false,
                message: "Username or email is already registered.",
                error: {
                    code: "CONFLICT",
                    details: null
                }
            }, { status: 409 });
        }

        return Response.json({
            success: false,
            message: "Registration failed. Please try again.",
            error: {
                code: "INTERNAL_ERROR",
                details: null
            }
        }, { status: 500 });

    } finally {
        if (connection) {
            connection.release();
        }
    }
}
