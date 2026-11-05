
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/authorization";
import pool from "@/lib/mysql";
import bcrypt from "bcryptjs";

// GET: Retrieve the authenticated player's profile
export async function GET() {
    const { player, response } = await authorizeRequest([
        "PLAYER",
        "ADMIN"
    ]);

    if (response) {
        return response;
    }

    return NextResponse.json({
        success: true,
        message: "Player profile retrieved successfully.",
        data: {
            player
        }
    });
}


// PUT: Update the authenticated player's profile
export async function PUT(request) {
    const { player, response } = await authorizeRequest([
        "PLAYER",
        "ADMIN"
    ]);

    if (response) {
        return response;
    }

    try {
        let body;

        // Handle an empty or invalid JSON request body
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({
                success: false,
                message: "Request body must contain valid JSON."
            }, { status: 400 });
        }

        // Ensure the JSON body is an object
        if (
            !body ||
            typeof body !== "object" ||
            Array.isArray(body)
        ) {
            return NextResponse.json({
                success: false,
                message: "Invalid request body."
            }, { status: 400 });
        }

        const {
            username,
            email,
            currentPassword,
            newPassword
        } = body;
        
        // Reject attempts to modify protected fields
        const protectedFields = [
            "player_id",
            "role",
            "spheres",
            "is_computer"
        ];

        if (protectedFields.some(field =>
            Object.prototype.hasOwnProperty.call(body, field)
        )) {
            return NextResponse.json({
                success: false,
                message: "You are not allowed to modify protected profile fields."
            }, { status: 403 });
        }

        // Check whether at least one editable field was provided
        if (
            username === undefined &&
            email === undefined &&
            newPassword === undefined
        ) {
            return NextResponse.json({
                success: false,
                message: "No profile changes were provided."
            }, { status: 400 });
        }

        const updates = [];
        const values = [];

        // Validate and prepare username
        if (username !== undefined) {
            if (
                typeof username !== "string" ||
                username.trim().length === 0 ||
                username.trim().length > 50
            ) {
                return NextResponse.json({
                    success: false,
                    message: "Username must be between 1 and 50 characters."
                }, { status: 400 });
            }

            updates.push("username = ?");
            values.push(username.trim());
        }

        // Validate and prepare email
        if (email !== undefined) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (
                typeof email !== "string" ||
                email.length > 100 ||
                !emailRegex.test(email.trim())
            ) {
                return NextResponse.json({
                    success: false,
                    message: "Please provide a valid email address (maximum 100 characters)."
                }, { status: 400 });
            }

            updates.push("email = ?");
            values.push(email.trim());
        }

        // Verify current password before allowing a password change
        if (newPassword !== undefined) {
            if (
                typeof newPassword !== "string" ||
                newPassword.length < 8
            ) {
                return NextResponse.json({
                    success: false,
                    message: "New password must contain at least 8 characters."
                }, { status: 400 });
            }

            if (typeof currentPassword !== "string" || !currentPassword) {
                return NextResponse.json({
                    success: false,
                    message: "Current password is required to change your password."
                }, { status: 400 });
            }

            const [rows] = await pool.execute(
                `SELECT password_hash
                 FROM PLAYER
                 WHERE player_id = ?
                 LIMIT 1`,
                [player.player_id]
            );

            if (rows.length === 0) {
                return NextResponse.json({
                    success: false,
                    message: "Player account not found."
                }, { status: 404 });
            }

            const passwordMatches = await bcrypt.compare(
                currentPassword,
                rows[0].password_hash
            );

            if (!passwordMatches) {
                return NextResponse.json({
                    success: false,
                    message: "Current password is incorrect."
                }, { status: 401 });
            }

            const hashedPassword = await bcrypt.hash(newPassword, 12);

            updates.push("password_hash = ?");
            values.push(hashedPassword);
        }

        // Update only the authenticated player's record
        values.push(player.player_id);

        await pool.execute(
            `UPDATE PLAYER
             SET ${updates.join(", ")}
             WHERE player_id = ?`,
            values
        );

        // Retrieve the updated profile
        const [updatedRows] = await pool.execute(
            `SELECT player_id, username, email, role, spheres
             FROM PLAYER
             WHERE player_id = ?
             LIMIT 1`,
            [player.player_id]
        );

        return NextResponse.json({
            success: true,
            message: "Player profile updated successfully.",
            data: {
                player: updatedRows[0]
            }
        });

    } catch (error) {
        console.error("Profile update error:", error);

        // Handle duplicate username or email
        if (error.code === "ER_DUP_ENTRY") {
            return NextResponse.json({
                success: false,
                message: "Username or email is already in use."
            }, { status: 409 });
        }

        return NextResponse.json({
            success: false,
            message: "Unable to update player profile."
        }, { status: 500 });
    }
}
