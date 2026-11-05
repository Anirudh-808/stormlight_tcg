
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/authorization";

export async function GET() {
    // Allow authenticated players and administrators
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
