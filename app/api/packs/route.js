
import { NextResponse } from "next/server";
import pool from "@/lib/mysql";
import { authorizeRequest } from "@/lib/authorization";

// GET: Retrieve available packs
export async function GET() {
  const { player, response } = await authorizeRequest([
    "PLAYER",
    "ADMIN"
  ]);

  if (response) return response;

  try {
    const [packs] = await pool.execute(
      `SELECT pack_id, pack_cost, card_count
       FROM PACK
       ORDER BY pack_id`
    );

    return NextResponse.json({
      success: true,
      message: "Available packs retrieved successfully.",
      data: {
        player_spheres: player.spheres,
        packs
      }
    });

  } catch (error) {
    console.error("Get packs error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to retrieve available packs."
      },
      { status: 500 }
    );
  }
}

// POST: Purchase a pack
export async function POST(request) {
  const { player, response } = await authorizeRequest([
    "PLAYER",
    "ADMIN"
  ]);

  if (response) return response;

  let connection;

  try {
    let body;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid JSON request body."
        },
        { status: 400 }
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      !Number.isSafeInteger(body.pack_id) ||
      body.pack_id <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "A valid positive pack_id is required."
        },
        { status: 400 }
      );
    }

    connection = await pool.getConnection();

    // Initialize the OUT parameter.
    await connection.query("SET @purchase_id = NULL");

    // Execute the stored procedure.
    await connection.query(
      "CALL PurchaseAndGeneratePack(?, ?, @purchase_id)",
      [player.player_id, body.pack_id]
    );

    // Retrieve the generated purchase ID.
    const [purchaseResult] = await connection.query(
      "SELECT @purchase_id AS purchase_id"
    );

    const purchaseId = purchaseResult[0]?.purchase_id;

    if (!purchaseId) {
      throw new Error("Purchase ID was not returned.");
    }

    // Retrieve purchase details and updated sphere balance.
    const [purchaseRows] = await connection.execute(
      `SELECT
          pp.purchase_id,
          pp.pack_id,
          pp.spheres_spent,
          p.spheres AS remaining_spheres
       FROM PACK_PURCHASE pp
       JOIN PLAYER p ON pp.player_id = p.player_id
       WHERE pp.purchase_id = ?
         AND pp.player_id = ?`,
      [purchaseId, player.player_id]
    );

    // Retrieve all cards generated in this purchase.
    const [cards] = await connection.execute(
      `SELECT
          ppc.slot_number,
          c.card_id,
          c.card_name,
          c.card_type,
          c.rarity,
          c.description
       FROM PACK_PURCHASE_CARD ppc
       JOIN CARD c ON ppc.card_id = c.card_id
       WHERE ppc.purchase_id = ?
       ORDER BY ppc.slot_number`,
      [purchaseId]
    );

    if (purchaseRows.length === 0) {
      throw new Error("Purchase details could not be retrieved.");
    }

    return NextResponse.json(
      {
        success: true,
        message: "Pack purchased successfully.",
        purchase: {
          ...purchaseRows[0],
          cards_generated: cards.length
        },
        cards
      },
      { status: 201 }
    );

  } catch (error) {
    console.error("Pack purchase error:", error);

    if (
      error.errno === 1644 ||
      error.code === "ER_SIGNAL_EXCEPTION"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: error.sqlMessage || error.message
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Unable to purchase pack."
      },
      { status: 500 }
    );

  } finally {
    if (connection) {
      connection.release();
    }
  }
}
