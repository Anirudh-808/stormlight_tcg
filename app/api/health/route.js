
import pool from "@/lib/mysql";
import clientPromise from "@/lib/mongodb";

export async function GET() {
    try {
        // Test MySQL connection
        const [mysqlResult] = await pool.query(
            "SELECT 1 AS connected"
        );

        // Test MongoDB connection
        const client = await clientPromise;

        const mongoResult = await client
            .db(process.env.MONGODB_DB)
            .command({ ping: 1 });

        return Response.json({
            success: true,
            message: "Both databases connected successfully!",
            databases: {
                mysql: mysqlResult[0].connected === 1
                    ? "Connected"
                    : "Failed",

                mongodb: mongoResult.ok === 1
                    ? "Connected"
                    : "Failed"
            }
        });

    } catch (error) {
        console.error("Database connection error:", error);

        return Response.json({
            success: false,
            message: "Database connection failed. Check the server logs."
        }, { status: 500 });
    }
}
