
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import pool from "@/lib/mysql";
import { verifyToken } from "@/lib/auth";

export async function authorizeRequest(allowedRoles = []) {
    try {
        // Read authentication cookie
        const cookieStore = await cookies();
        const token = cookieStore.get("tcg_session")?.value;

        if (!token) {
            return {
                player: null,
                response: NextResponse.json({
                    success: false,
                    message: "Authentication required."
                }, { status: 401 })
            };
        }

        // Verify JWT
        const payload = await verifyToken(token);

        if (!payload || !payload.player_id) {
            return {
                player: null,
                response: NextResponse.json({
                    success: false,
                    message: "Invalid or expired session."
                }, { status: 401 })
            };
        }

        // Retrieve current player details from MySQL
        const [rows] = await pool.execute(
            `SELECT player_id, username, email, role, spheres
             FROM PLAYER
             WHERE player_id = ?
             AND is_computer = FALSE
             LIMIT 1`,
            [payload.player_id]
        );

        if (rows.length === 0) {
            return {
                player: null,
                response: NextResponse.json({
                    success: false,
                    message: "Player account not found."
                }, { status: 401 })
            };
        }

        const player = rows[0];

        // Check application role
        if (
            allowedRoles.length > 0 &&
            !allowedRoles.includes(player.role)
        ) {
            return {
                player,
                response: NextResponse.json({
                    success: false,
                    message: "You do not have permission to access this resource."
                }, { status: 403 })
            };
        }

        return {
            player,
            response: null
        };

    } catch (error) {
        console.error("Authorization error:", error);

        return {
            player: null,
            response: NextResponse.json({
                success: false,
                message: "Unable to authorize request."
            }, { status: 500 })
        };
    }
}
