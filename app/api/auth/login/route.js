
import pool from "@/lib/mysql";
import bcrypt from "bcryptjs";
import { createToken } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(request) {
    try {
        let body;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json({
                success: false,
                message: "Invalid JSON request body.",
                error: { code: "VALIDATION_ERROR" }
            }, { status: 400 });
        }

        const { username, password } = body;

        if (
            typeof username !== "string" ||
            typeof password !== "string" ||
            !username.trim() ||
            !password
        ) {
            return NextResponse.json({
                success: false,
                message: "Username and password are required.",
                error: { code: "VALIDATION_ERROR" }
            }, { status: 400 });
        }

        // Find the player by username
        const [rows] = await pool.execute(
            `SELECT player_id, username, email, password_hash,
                    role, is_computer, spheres
             FROM PLAYER
             WHERE username = ?
             LIMIT 1`,
            [username.trim()]
        );

        if (rows.length === 0) {
            return NextResponse.json({
                success: false,
                message: "Invalid username or password.",
                error: { code: "UNAUTHORIZED" }
            }, { status: 401 });
        }

        const player = rows[0];

        // Computer opponents cannot log in
        if (player.is_computer) {
            return NextResponse.json({
                success: false,
                message: "Invalid username or password.",
                error: { code: "UNAUTHORIZED" }
            }, { status: 401 });
        }

        // Check password hash
        if (!player.password_hash) {
            return NextResponse.json({
                success: false,
                message: "Invalid username or password.",
                error: { code: "UNAUTHORIZED" }
            }, { status: 401 });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            player.password_hash
        );

        if (!passwordMatches) {
            return NextResponse.json({
                success: false,
                message: "Invalid username or password.",
                error: { code: "UNAUTHORIZED" }
            }, { status: 401 });
        }

        // Generate authentication token
        const token = await createToken(player);

        // Create response
        const response = NextResponse.json({
            success: true,
            message: "Login successful.",
            data: {
                player: {
                    player_id: player.player_id,
                    username: player.username,
                    email: player.email,
                    role: player.role,
                    spheres: player.spheres
                }
            }
        });

        // Store JWT in an HttpOnly cookie
        response.cookies.set("tcg_session", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24
        });

        return response;

    } catch (error) {
        console.error("Login error:", error);

        return NextResponse.json({
            success: false,
            message: "Login failed. Please try again.",
            error: { code: "INTERNAL_ERROR" }
        }, { status: 500 });
    }
}
