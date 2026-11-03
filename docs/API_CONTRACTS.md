# Stormlight TCG — API Contracts

**Document type:** Frontend–Backend Integration Specification  
**API architecture:** Next.js App Router Route Handlers  
**API base path:** `/api`  
**Status:** Proposed — implementation pending

This document defines the planned API interface for the Stormlight Archive Trading Card Game. It is the shared agreement between frontend and backend development.

The frontend should follow the request and response formats documented here. Backend implementation should preserve these contracts unless both developers agree to a change.

---

# 1. General API Conventions

## 1.1 Base URL

During local development:

```text
http://localhost:3000/api
```

All API endpoints return JSON unless otherwise specified.

## 1.2 Standard Success Response

Successful requests should use a consistent response structure:

```json
{
  "success": true,
  "message": "Operation completed successfully.",
  "data": {}
}
```

The `data` property contains the endpoint-specific result.

## 1.3 Standard Error Response

All API errors should follow this structure:

```json
{
  "success": false,
  "message": "A description of the error.",
  "error": {
    "code": "ERROR_CODE",
    "details": null
  }
}
```

Examples of error codes:

| Code | Meaning |
|---|---|
| VALIDATION_ERROR | Invalid input |
| UNAUTHORIZED | Authentication required |
| FORBIDDEN | Insufficient permissions |
| NOT_FOUND | Requested resource does not exist |
| CONFLICT | Resource conflicts with existing data |
| INSUFFICIENT_SPHERES | Not enough currency |
| INSUFFICIENT_CARDS | Player does not own enough copies |
| INVALID_DECK | Deck does not satisfy game rules |
| INVALID_ACTION | Game action is not allowed |
| INTERNAL_ERROR | Unexpected server error |

## 1.4 HTTP Status Codes

| Status | Usage |
|---|---|
| 200 | Successful retrieval or update |
| 201 | Resource successfully created |
| 400 | Invalid request |
| 401 | Authentication required or invalid |
| 403 | Authenticated but not authorized |
| 404 | Resource not found |
| 409 | Conflict or insufficient resources |
| 500 | Internal server error |

## 1.5 Authentication

Authentication is planned using JWT tokens stored in secure HttpOnly cookies.

The browser should send cookies automatically with same-origin requests.

Frontend JavaScript should not read or store the JWT directly.

Protected endpoints require a valid authenticated session.

The backend must identify the current player from the verified token rather than trusting a `player_id` supplied by the frontend.

## 1.6 Database Responsibilities

| Database | Responsibility |
|---|---|
| MySQL | Players, cards, collections, decks, matches, turns, actions, packs and Sphere transactions |
| MongoDB | Detailed card information, including lore, moves, Ideals, effects and special rules |

The MySQL `CARD` record is linked to its MongoDB `card_details` document through `card_id`.

---

# 2. Authentication APIs

Authentication endpoints are used to register players, establish sessions and retrieve the currently authenticated player.

## 2.1 Register Player

**POST** `/api/auth/register`

Registers a new player.

### Request Body

```json
{
  "username": "radiant_player",
  "email": "player@example.com",
  "password": "example_password"
}
```

### Success Response — 201

```json
{
  "success": true,
  "message": "Account created successfully.",
  "data": {
    "player": {
      "player_id": 1,
      "username": "radiant_player",
      "email": "player@example.com",
      "spheres": 0
    }
  }
}
```

The backend must hash the password before storing it.

The backend should also initialize the player's starter collection according to the project rules.

### Validation

- Username must be provided and unique.
- Email must be valid and unique when provided.
- Password must satisfy the agreed password policy.
- The client must not choose its own `player_id`, Sphere balance or computer-player status.

### Possible Errors

- `400 VALIDATION_ERROR`
- `409 CONFLICT`

---

## 2.2 Login

**POST** `/api/auth/login`

Authenticates an existing player.

### Request Body

```json
{
  "username": "radiant_player",
  "password": "example_password"
}
```

### Success Response — 200

```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "player": {
      "player_id": 1,
      "username": "radiant_player",
      "spheres": 0
    }
  }
}
```

The backend sets the authentication token as an HttpOnly cookie.

The token should not be included in the JSON response.

### Possible Errors

- `400 VALIDATION_ERROR`
- `401 UNAUTHORIZED`

---

## 2.3 Logout

**POST** `/api/auth/logout`

Logs out the currently authenticated player.

### Success Response — 200

```json
{
  "success": true,
  "message": "Logged out successfully.",
  "data": null
}
```

The backend clears the authentication cookie.

---

## 2.4 Get Current Player

**GET** `/api/auth/me`

Returns information about the currently authenticated player.

### Success Response — 200

```json
{
  "success": true,
  "message": "Current player retrieved.",
  "data": {
    "player": {
      "player_id": 1,
      "username": "radiant_player",
      "email": "player@example.com",
      "spheres": 500
    }
  }
}
```

### Authentication

Required.

---

# 3. Player APIs

## 3.1 Get Player Profile

**GET** `/api/players/me`

Returns the authenticated player's profile.

### Success Response — 200

```json
{
  "success": true,
  "message": "Player profile retrieved.",
  "data": {
    "player": {
      "player_id": 1,
      "username": "radiant_player",
      "email": "player@example.com",
      "spheres": 500,
      "created_at": "2026-11-03T10:00:00.000Z"
    }
  }
}
```

### Authentication

Required.

## 3.2 Get Player Collection

**GET** `/api/players/me/collection`

Returns all cards owned by the authenticated player.

### Success Response — 200

```json
{
  "success": true,
  "message": "Collection retrieved.",
  "data": {
    "cards": [
      {
        "card_id": 1,
        "card_name": "Example Radiant",
        "card_type": "CHARACTER",
        "rarity": "RARE",
        "quantity": 1
      },
      {
        "card_id": 2,
        "card_name": "Example Event",
        "card_type": "EVENT",
        "rarity": "COMMON",
        "quantity": 3
      }
    ],
    "summary": {
      "distinct_card_types": 2,
      "total_cards": 4
    }
  }
}
```

The response should use the player's `PLAYER_CARD` records joined with the corresponding `CARD` records.

### Authentication

Required.

---

# 4. Card APIs

Card APIs retrieve common card information from MySQL and detailed card information from MongoDB.

## 4.1 Get Card Catalogue

**GET** `/api/cards`

Returns the available card catalogue.

### Optional Query Parameters

| Parameter | Description |
|---|---|
| `type` | CHARACTER, EVENT or HELPER |
| `rarity` | COMMON, RARE, EPIC or LEGENDARY |
| `search` | Search by card name or description |
| `page` | Page number |
| `limit` | Number of results per page |

Example:

```text
/api/cards?type=CHARACTER&rarity=RARE&page=1&limit=20
```

### Success Response — 200

```json
{
  "success": true,
  "message": "Card catalogue retrieved.",
  "data": {
    "cards": [
      {
        "card_id": 1,
        "card_name": "Example Radiant",
        "card_type": "CHARACTER",
        "rarity": "RARE",
        "description": "Example card description."
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "total_pages": 1
    }
  }
}
```

Pagination and filtering are planned interface features.

## 4.2 Get Card Details

**GET** `/api/cards/:id`

Returns complete information for a specific card.

### Success Response — 200

```json
{
  "success": true,
  "message": "Card details retrieved.",
  "data": {
    "card": {
      "card_id": 1,
      "card_name": "Example Radiant",
      "card_type": "CHARACTER",
      "rarity": "RARE",
      "description": "Example description.",
      "character_details": {
        "character_type": "RADIANT",
        "base_hp": 100,
        "max_light": 50,
        "weapon_or_spren": "Example Spren",
        "order_name": "Example Order"
      },
      "details": {
        "lore": "Example lore.",
        "flavour_text": "Example flavour text.",
        "moves": [],
        "ideals": [],
        "effects": [],
        "special_rules": []
      }
    }
  }
}
```

For Event/Helper cards, the backend should return the applicable `event_helper` subtype information instead of `character_details`.

### Database Sources

- MySQL: `CARD`, `CHARACTER_CARD` or `EVENT_HELPER`.
- MongoDB: `card_details`.

### Important

If a card has no MongoDB details document, the API should still return its available MySQL information. The detailed `details` property can be `null`.

---

# 5. Deck APIs

A player can create and maintain multiple decks.

The deck composition must satisfy the project rules.

## 5.1 Get Player Decks

**GET** `/api/decks`

Returns all decks belonging to the authenticated player.

### Success Response — 200

```json
{
  "success": true,
  "message": "Decks retrieved.",
  "data": {
    "decks": [
      {
        "deck_id": 1,
        "deck_name": "My First Deck",
        "total_cards": 16,
        "is_valid": true,
        "created_at": "2026-11-03T10:00:00.000Z"
      }
    ]
  }
}
```

## 5.2 Get a Specific Deck

**GET** `/api/decks/:id`

Returns a deck and its card composition.

### Success Response — 200

```json
{
  "success": true,
  "message": "Deck retrieved.",
  "data": {
    "deck": {
      "deck_id": 1,
      "deck_name": "My First Deck",
      "cards": [
        {
          "card_id": 1,
          "card_name": "Example Radiant",
          "card_type": "CHARACTER",
          "quantity": 1
        },
        {
          "card_id": 2,
          "card_name": "Example Event",
          "card_type": "EVENT",
          "quantity": 3
        }
      ],
      "validation": {
        "total_cards": 16,
        "character_cards": 3,
        "event_helper_cards": 13,
        "is_valid": true
      }
    }
  }
}
```

## 5.3 Create a Deck

**POST** `/api/decks`

Creates an empty deck for the authenticated player.

### Request Body

```json
{
  "deck_name": "My First Deck"
}
```

### Success Response — 201

```json
{
  "success": true,
  "message": "Deck created successfully.",
  "data": {
    "deck_id": 1,
    "deck_name": "My First Deck"
  }
}
```

## 5.4 Add a Card to a Deck

**POST** `/api/decks/:id/cards`

Adds a card to the selected deck.

### Request Body

```json
{
  "card_id": 5,
  "quantity": 2
}
```

### Success Response — 200

```json
{
  "success": true,
  "message": "Card added to deck.",
  "data": {
    "deck_id": 1,
    "card_id": 5,
    "quantity": 2
  }
}
```

### Validation Rules

- The deck must belong to the authenticated player.
- The player must own enough copies of the card.
- Quantity must be positive.
- No individual card may exceed 3 copies.
- Character cards must be unique within the deck.
- The final deck must contain exactly 3 character cards and 13 Event/Helper cards.

The database's existing `AddCardToDeck` procedure and associated validation logic should be used where appropriate.

## 5.5 Remove a Card from a Deck

**DELETE** `/api/decks/:id/cards/:cardId`

Removes the selected card entry from the deck.

### Success Response — 200

```json
{
  "success": true,
  "message": "Card removed from deck.",
  "data": null
}
```

## 5.6 Validate a Deck

**POST** `/api/decks/:id/validate`

Checks whether the deck satisfies all composition and ownership rules.

### Success Response — 200

```json
{
  "success": true,
  "message": "Deck validation completed.",
  "data": {
    "deck_id": 1,
    "total_cards": 16,
    "character_cards": 3,
    "event_helper_cards": 13,
    "is_valid": true
  }
}
```

The backend should call the existing `ValidateDeck` stored procedure.

### Invalid Deck Response

```json
{
  "success": false,
  "message": "Deck must contain exactly 16 cards.",
  "error": {
    "code": "INVALID_DECK",
    "details": {
      "total_cards": 14,
      "required_cards": 16
    }
  }
}
```

The actual validation error should reflect the database or application validation result.

## 5.7 Update Deck Name

**PUT** `/api/decks/:id`

Updates the deck's name.

### Request Body

```json
{
  "deck_name": "Updated Deck Name"
}
```

### Success Response — 200

```json
{
  "success": true,
  "message": "Deck updated successfully.",
  "data": {
    "deck_id": 1,
    "deck_name": "Updated Deck Name"
  }
}
```

## 5.8 Delete a Deck

**DELETE** `/api/decks/:id`

Deletes the selected deck belonging to the authenticated player.

### Success Response — 200

```json
{
  "success": true,
  "message": "Deck deleted successfully.",
  "data": null
}
```

---

# 6. Pack APIs

Packs allow players to spend Spheres to obtain additional cards.

The current design specifies:

- Pack cost: 500 Spheres.
- Cards per pack: 5.
- Rarity/type probabilities: not finalized.

## 6.1 Get Available Packs

**GET** `/api/packs`

Returns the available pack types.

### Success Response — 200

```json
{
  "success": true,
  "message": "Available packs retrieved.",
  "data": {
    "packs": [
      {
        "pack_id": 1,
        "pack_cost": 500,
        "card_count": 5
      }
    ]
  }
}
```

## 6.2 Purchase a Pack

**POST** `/api/packs/purchase`

Purchases a pack for the authenticated player.

### Request Body

```json
{
  "pack_id": 1
}
```

### Success Response — 201

```json
{
  "success": true,
  "message": "Pack purchased successfully.",
  "data": {
    "purchase_id": 1,
    "pack_id": 1,
    "spheres_spent": 500,
    "remaining_spheres": 0,
    "cards_received": [
      {
        "card_id": 1,
        "card_name": "Example Card",
        "rarity": "RARE",
        "quantity": 1
      }
    ]
  }
}
```

The actual purchase should return five cards according to the finalized pack-generation rules.

### Backend Responsibilities

The purchase must be handled atomically:

1. Verify that the pack exists.
2. Verify that the player has sufficient Spheres.
3. Deduct the pack cost.
4. Record the pack purchase.
5. Generate the pack contents.
6. Add the obtained cards to the player's collection.
7. Record the corresponding Sphere transaction.

The existing `PurchasePack` stored procedure should be reviewed and used or extended as necessary.

A failed purchase must not partially deduct currency or partially update the collection.

### Possible Errors

- `404 NOT_FOUND`
- `409 INSUFFICIENT_SPHERES`
- `400 VALIDATION_ERROR`

---

# 7. Match APIs

Matches are played between a human player and a scripted computer opponent.

The backend is responsible for maintaining the authoritative match state and validating every game action.

## 7.1 Start a Match

**POST** `/api/matches`

Starts a match using a selected valid deck.

### Request Body

```json
{
  "deck_id": 1
}
```

### Success Response — 201

```json
{
  "success": true,
  "message": "Match started successfully.",
  "data": {
    "match_id": 1,
    "status": "IN_PROGRESS",
    "player": {
      "player_id": 1,
      "characters": [],
      "hand": []
    },
    "opponent": {
      "player_id": 2,
      "characters": [],
      "hand": []
    },
    "current_turn": {
      "turn_number": 1,
      "player_id": 1
    }
  }
}
```

The arrays are populated with the actual match characters and initial hand.

### Backend Responsibilities

- Verify that the deck belongs to the player.
- Validate the deck before starting.
- Select the computer opponent.
- Initialize match characters and their temporary statistics.
- Set up the initial hand of 5 Event/Helper cards for each side as applicable to the finalized game implementation.
- Shuffle the Event/Helper cards.
- Determine the starting player using the coin toss.
- Create the match and associated match-character records.

## 7.2 Get Match State

**GET** `/api/matches/:id`

Retrieves the current state of a match.

### Success Response — 200

```json
{
  "success": true,
  "message": "Match state retrieved.",
  "data": {
    "match_id": 1,
    "status": "IN_PROGRESS",
    "current_turn": {
      "turn_number": 3,
      "player_id": 1
    },
    "player": {
      "characters": [],
      "hand": []
    },
    "opponent": {
      "characters": [],
      "hand": []
    },
    "available_actions": []
  }
}
```

The backend must only expose information the requesting player is allowed to see. Opponent hidden cards must not be revealed.

## 7.3 Perform a Match Action

**POST** `/api/matches/:id/actions`

Submits a game action.

### Example: Character Attack

```json
{
  "action_type": "ATTACK",
  "source_match_character_id": 10,
  "target_match_character_id": 20,
  "move_name": "Basic Attack"
}
```

### Example: Special Move

```json
{
  "action_type": "SPECIAL",
  "source_match_character_id": 10,
  "target_match_character_id": 20,
  "move_name": "Shield"
}
```

### Example: Event or Helper Card

```json
{
  "action_type": "EVENT",
  "card_id": 15,
  "target_match_character_id": 20
}
```

### Example: Pass

```json
{
  "action_type": "PASS"
}
```

### Success Response — 200

```json
{
  "success": true,
  "message": "Action completed successfully.",
  "data": {
    "action_id": 25,
    "match_id": 1,
    "action_type": "ATTACK",
    "result": {
      "damage_dealt": 20,
      "target_current_hp": 80
    },
    "match_status": "IN_PROGRESS",
    "next_turn": {
      "turn_number": 4,
      "player_id": 2
    }
  }
}
```

### Backend Responsibilities

- Verify match participation.
- Verify that the match is still active.
- Verify that it is the requesting player's turn.
- Verify that the source character is active and eligible.
- Verify that the requested move exists and can be performed.
- Check Light, Intent, Ideal, cooldown and other applicable conditions.
- Enforce one character move and up to two additional Event/Helper plays per turn.
- Apply damage, healing, buffs and status changes.
- Record the action in `GAME_ACTION`.
- Update `MATCH_CHARACTER` state.
- Determine whether a character has been defeated.
- Determine whether the match has ended.
- Advance the turn when appropriate.

The backend, not the frontend, must calculate and validate game outcomes.

### Important Game Rules

- Character rotation follows the defined order.
- Damage persists between turns.
- Defeated characters cannot return during the match.
- Radiant Intent and Ideal progression are match-specific.
- Shardbearers become inactive for two turns when their Light reaches zero.
- Event/Helper cards follow their cooldown rules and may become available again.

The detailed move effects and cooldown behavior must follow the finalized game rules and card data.

## 7.4 Get Match History

**GET** `/api/matches`

Returns the authenticated player's previous and current matches.

### Optional Query Parameters

| Parameter | Description |
|---|---|
| `status` | IN_PROGRESS, COMPLETED or ABANDONED |
| `page` | Page number |
| `limit` | Number of results |

### Success Response — 200

```json
{
  "success": true,
  "message": "Match history retrieved.",
  "data": {
    "matches": [
      {
        "match_id": 1,
        "opponent": "hoid_bot",
        "status": "COMPLETED",
        "result": "WIN",
        "started_at": "2026-11-03T10:00:00.000Z",
        "ended_at": "2026-11-03T10:15:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "total_pages": 1
    }
  }
}
```

## 7.5 Get Match Summary

**GET** `/api/matches/:id/summary`

Returns the completed match summary.

### Success Response — 200

```json
{
  "success": true,
  "message": "Match summary retrieved.",
  "data": {
    "match_id": 1,
    "status": "COMPLETED",
    "winner_id": 1,
    "winner_username": "radiant_player",
    "reward": {
      "spheres_earned": 100
    },
    "turns_played": 12,
    "actions": []
  }
}
```

The reward is granted only once when the match is successfully completed with a player victory.

---

# 8. Authentication and Authorization Matrix

The following table describes the planned access rules.

| Endpoint Group | Guest | Authenticated Player |
|---|---:|---:|
| Register | Yes | Yes |
| Login | Yes | Yes |
| Logout | No | Yes |
| Current player | No | Yes |
| Player profile | No | Yes |
| Player collection | No | Yes |
| Card catalogue | Yes | Yes |
| Card details | Yes | Yes |
| Deck operations | No | Yes |
| Pack operations | No | Yes |
| Match operations | No | Yes |

Players must only access or modify their own collections, decks and matches.

### Roles

The current relational schema contains `is_computer` to identify computer opponents, but does not yet contain a user authorization role.

The project requirements call for at least two roles where applicable. A proposed application-level role system is:

- `PLAYER`: normal game access.
- `ADMIN`: administrative management operations.

This requires a schema or authorization design decision before implementation. The `is_computer` flag must remain separate from user authorization roles.

No administrative API endpoints are included in this initial contract.

---

# 9. Important Implementation Notes

## 9.1 MySQL Stored Procedures and Functions

The existing SQL implementation includes:

| Database Object | Purpose |
|---|---|
| `CalculateDeckSize` | Calculate the total number of cards in a deck |
| `GetTotalPlayerCards` | Calculate a player's total card count |
| `ValidateDeck` | Validate deck composition and ownership |
| `AddCardToDeck` | Add a card to a deck |
| `RemoveCardFromDeck` | Remove a card from a deck |
| `PurchasePack` | Handle pack purchase |
| `GetMatchSummary` | Retrieve match summary information |

The backend should reuse these database operations where appropriate instead of duplicating their logic unnecessarily.

## 9.2 MongoDB Document Structure

Collection: `card_details`

Proposed document example:

```json
{
  "card_id": 1,
  "lore": "Example lore.",
  "flavour_text": "Example flavour text.",
  "moves": [
    {
      "name": "Basic Attack",
      "type": "ATTACK",
      "light_cost": 5,
      "damage": 20,
      "description": "Example move."
    }
  ],
  "ideals": [
    {
      "level": 1,
      "description": "Example Ideal."
    }
  ],
  "effects": [],
  "special_rules": []
}
```

The exact nested fields can vary according to the card type.

A unique index on `card_id` should be maintained.

## 9.3 Transactional Operations

Operations involving multiple related database updates must preserve consistency.

Particularly important:

- Pack purchases.
- Sphere deductions and rewards.
- Collection updates.
- Match completion and rewards.

MySQL transactions should be used for related relational updates.

MongoDB is not automatically part of a MySQL transaction. Cross-database operations must be designed so that failures do not leave inconsistent application state.

## 9.4 Security Requirements

- Passwords must be hashed before storage.
- Database credentials must be stored in environment variables.
- JWT secrets must never be committed.
- Authentication cookies should be HttpOnly, Secure in production and configured with an appropriate SameSite policy.
- All protected resources must be checked against the authenticated player's identity.
- Client-supplied game results, Sphere balances and ownership claims must never be trusted.
- All request bodies must be validated on the backend.
- SQL queries must use parameterized statements.

---

# 10. Frontend–Backend Integration Rules

Both developers should follow these agreements:

1. The frontend must use the endpoint paths and HTTP methods defined in this document.
2. The frontend must not access MySQL or MongoDB directly.
3. The backend must not assume that frontend validation is sufficient.
4. All API responses must follow the standard success/error structure.
5. Any change to an endpoint's request or response format must be discussed and reflected in this document.
6. The frontend must display useful loading, success and error states.
7. The backend is authoritative for game rules, ownership, currency and match outcomes.
8. Both developers should test integration using the agreed request and response formats.

---

# 11. Items Requiring Finalization

The following decisions are not fully specified in the current project design and must be settled before their corresponding features are completed.

| Item | Current Status |
|---|---|
| Pack rarity/type probabilities | Not finalized |
| Exact card statistics and move effects | Some details remain to be refined |
| Detailed computer-opponent rules | Not fully finalized |
| User role storage and admin permissions | Requires schema/design decision |
| Exact authentication expiry and password policy | Requires implementation decision |
| Match hand, deck and cooldown lifecycle details | Requires final game-logic specification |
| API pagination defaults and maximum limits | Proposed; implementation decision pending |

These are intentionally left open rather than being treated as finalized requirements.

---

**End of API Contract Document**  
**Project:** Stormlight Archive Trading Card Game  
**API architecture:** Next.js Route Handlers  
**Document status:** Proposed — subject to agreement by both developers
