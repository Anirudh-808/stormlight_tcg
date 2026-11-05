
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";

export async function POST() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("tcg_session")?.value;

        // Check whether an active session exists
        const session = token ? await verifyToken(token) : null;

        if (!session?.player_id) {
            const response = NextResponse.json({
                success: false,
                message: "You are not currently logged in.",
                error: { code: "NOT_AUTHENTICATED" }
            }, { status: 401 });

            // Clear any invalid or expired cookie
            response.cookies.set("tcg_session", "", {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/",
                maxAge: 0
            });

            return response;
        }

        // Clear the valid session cookie
        const response = NextResponse.json({
            success: true,
            message: "Logged out successfully."
        });

        response.cookies.set("tcg_session", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 0
        });

        return response;

    } catch (error) {
        console.error("Logout error:", error);

        return NextResponse.json({
            success: false,
            message: "Logout failed. Please try again.",
            error: { code: "INTERNAL_ERROR" }
        }, { status: 500 });
    }
}
