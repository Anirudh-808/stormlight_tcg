
import { SignJWT, jwtVerify } from "jose";

const secret = process.env.JWT_SECRET;

if (!secret) {
    throw new Error("JWT_SECRET is missing from .env.local");
}

const secretKey = new TextEncoder().encode(secret);

// Generate JWT
export async function createToken(player) {
    return await new SignJWT({
        player_id: player.player_id,
        username: player.username,
        role: player.role
    })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("1d")
        .sign(secretKey);
}

// Verify JWT
export async function verifyToken(token) {
    try {
        const { payload } = await jwtVerify(token, secretKey);
        return payload;
    } catch {
        return null;
    }
}
