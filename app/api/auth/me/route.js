
import pool from "@/lib/mysql";
import { verifyToken } from "@/lib/auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        // Read authentication cookie
        const cookieStore = await cookies();
        const token = cookieStore.get("tcg_session")?.value;

        if (!token) {
            return NextResponse.json({
                success: false,
                message: "Authentication required."
            }, { status: 401 });
        }

        // Verify JWT
        const payload = await verifyToken(token);

        if (!payload || !payload.player_id) {
            return NextResponse.json({
                success: false,
                message: "Invalid or expired session."
            }, { status: 401 });
        }

        // Retrieve fresh player information from MySQL
        const [rows] = await pool.execute(
            `SELECT player_id, username, email, role, spheres
             FROM PLAYER
             WHERE player_id = ?
             AND is_computer = FALSE
             LIMIT 1`,
            [payload.player_id]
        );

        if (rows.length === 0) {
            return NextResponse.json({
                success: false,
                message: "Player account not found."
            }, { status: 401 });
        }

        return NextResponse.json({
            success: true,
            message: "Authenticated successfully.",
            data: {
                player: rows[0]
            }
        });

    } catch (error) {
        console.error("Session verification error:", error);

        return NextResponse.json({
            success: false,
            message: "Unable to verify session."
        }, { status: 500 });
    }
}
