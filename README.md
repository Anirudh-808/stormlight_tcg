# Stormlight Archive Trading Card Game

A web-based trading card game inspired by Brandon Sanderson's *The Stormlight Archive*, developed as a DBMS Level 3 Experiential Learning Mini Project.

Players collect cards, build decks, purchase packs using in-game currency (Spheres), and battle a scripted computer opponent.

## Project Information

- **Project:** Stormlight Archive Trading Card Game
- **Course:** DBMS Experiential Learning – Level 3
- **Frontend:** Next.js
- **Backend/API:** Next.js Route Handlers
- **Relational Database:** MySQL
- **NoSQL Database:** MongoDB
- **Version Control:** Git and GitHub

## Team

| Member | Primary Responsibility |
|---|---|
| Anirudh Nagarajan | Backend and database integration |
| Bharath Kumar | Frontend development |

Both members will contribute to application development, database integration, testing and final project documentation.

## Game Overview

The application implements a player-versus-computer trading card game. The computer opponent is represented by a predefined PLAYER record and follows deterministic game rules. It does not use machine learning or an AI model.

### Core Game Rules

- Each deck contains exactly 16 cards.
- A deck must contain exactly 3 unique character cards.
- The remaining 13 cards must be Event/Helper cards.
- Event/Helper cards may have duplicates, with a maximum of 3 copies of any card.
- Players can only add cards they own to their decks.
- A new player receives a 16-card starter collection: 2 Radiants, 1 Shardbearer and 13 Event/Helper cards.
- A match uses 3 characters per side.
- Players begin with 5 Event/Helper cards in hand.
- A coin toss determines the starting player.
- Each turn allows one character move and up to two additional Event/Helper card plays.
- Defeated characters are permanently removed from that match.
- The first side to defeat all three opposing characters wins.

### Character Types

**Radiants**
- Have HP, Light/Stormlight and Intent.
- Intent begins at zero and can advance through the five Ideals.
- Can use Light-consuming attacks and special moves.

**Shardbearers**
- Have HP and Light/Stormlight.
- Do not use Intent or Ideal progression.
- Become inactive for two turns when their Light reaches zero.

### Event and Helper Cards

Event/Helper cards may represent Heralds, Hoid, Realm events and Unmade-related events. Used cards become temporarily unavailable according to their cooldown and can return to use later.

### In-game Currency and Packs

- Currency: Spheres.
- Match-win reward: 100 Spheres.
- Pack price: 500 Spheres.
- Each pack contains 5 cards.
- Pack rarity/type probabilities are yet to be finalized.

## Technology and Database Design

### MySQL

MySQL stores structured information requiring relationships, constraints and transactional consistency.

The relational database is named `tcg` and includes tables for:

- PLAYER
- CARD
- CHARACTER_CARD
- EVENT_HELPER
- DECK
- DECK_CARD
- PLAYER_CARD
- matches
- MATCH_CHARACTER
- TURN
- GAME_ACTION
- PACK
- PACK_PURCHASE
- SPHERE_TRANSACTION

The project uses relational constraints, foreign keys, stored procedures, functions, triggers, views, indexes, full-text search and transactions.

### MongoDB

MongoDB stores flexible and nested card information in the `card_details` collection.

Each document corresponds to a MySQL card through `card_id` and can contain:

- `lore`
- `flavour_text`
- `moves[]`
- `ideals[]`
- `effects[]`
- `special_rules[]`

A unique index on `card_id` is intended to ensure one details document per card.

### Why Two Databases?

MySQL is suitable for structured entities and relationships such as players, collections, decks, matches and transactions.

MongoDB is suitable for variable-length and nested card information such as moves, Ideals, lore, effects and special rules.

The application combines information from both databases when complete card details are required.

## Application Architecture

The application uses Next.js App Router and Route Handlers.

- Frontend pages and components provide the user interface.
- Route Handlers expose the backend API.
- Service modules contain reusable application and game logic.
- Database modules manage MySQL and MongoDB connections.
- Environment variables hold local configuration and secrets.

See [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md) for the planned API endpoints and request/response formats.

## Project Structure

```text
stormlight_tcg/
│
├── app/
│   ├── api/
│   │   ├── auth/
│   │   ├── players/
│   │   ├── cards/
│   │   ├── decks/
│   │   ├── packs/
│   │   └── matches/
│   │
│   ├── (auth)/
│   ├── (game)/
│   ├── page.js
│   ├── layout.js
│   └── globals.css
│
├── components/
├── lib/
│   ├── mysql.js
│   └── mongodb.js
│
├── services/
├── docs/
│   └── API_CONTRACTS.md
│
├── public/
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Prerequisites

Install the following before running the application:

- Node.js
- npm
- MySQL 8.0.16 or later
- MongoDB Community Server
- Git
- A code editor such as Visual Studio Code

## Installation and Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Anirudh-808/stormlight_tcg.git
cd stormlight_tcg
```

### 2. Install Dependencies

```bash
npm install
```

On Windows PowerShell, if the npm script execution policy causes an error, use:

```powershell
npm.cmd install
```

### 3. Configure Environment Variables

Create a local file named `.env.local` in the project root.

Use `.env.example` as a reference:

```env
# MySQL
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=tcg

# MongoDB
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=your_mongodb_database_name

# Authentication
JWT_SECRET=replace_with_a_long_random_secret
```

Replace the placeholder values with your own local configuration.

**Never commit `.env.local` or share database passwords and authentication secrets.**

### 4. Set Up MySQL

1. Start your MySQL server.
2. Open the SQL implementation file provided with the project.
3. Execute the database setup script.
4. Confirm that the `tcg` database and its tables have been created.

**Important:** The current SQL setup script drops and recreates the `tcg` database. Back up any existing project data before executing it.

### 5. Set Up MongoDB

1. Start the MongoDB server.
2. Connect using MongoDB Compass or `mongosh`.
3. Configure the database name in `.env.local`.
4. Ensure that the `card_details` collection and its card documents are available.

MongoDB creates a database when data is first stored in it.

### 6. Run the Development Server

```bash
npm run dev
```

On Windows PowerShell:

```powershell
npm.cmd run dev
```

Open:

http://localhost:3000

## Development Workflow

The project uses separate Git branches for frontend and backend development.

| Branch | Purpose |
|---|---|
| `main` | Shared project foundation and stable integration |
| `backend` | Backend APIs, database connections and game logic |
| `frontend` | Pages, components and user interface |

Both developers should pull the latest changes before beginning work.

```bash
git pull origin main
```

Changes should be committed and pushed to the appropriate branch. Completed work should be reviewed and merged into `main`.

## Security

The application is intended to follow these practices:

- Store passwords as secure password hashes, never as plain text.
- Keep database credentials and JWT secrets in environment variables.
- Use secure HttpOnly cookies for authentication tokens.
- Validate incoming API requests.
- Enforce ownership checks for player resources.
- Apply database constraints and transactional operations to protect data integrity.
- Restrict administrative operations to authorized users.

Role-based authorization will be finalized as part of the application/database implementation.

## Current Development Status

The project repository and initial Next.js application have been created.

| Component | Status |
|---|---|
| Next.js project setup | Completed |
| GitHub repository | Completed |
| Initial dependencies | Installed |
| Shared folder structure | In progress |
| API contracts | In progress |
| MySQL integration | Pending |
| MongoDB integration | Pending |
| Backend implementation | Pending |
| Frontend implementation | Pending |
| Application integration | Pending |
| Testing and documentation | Pending |

## Future Enhancements

Potential future enhancements include:

- Finalized card rarity and pack-generation probabilities.
- Expanded computer-opponent strategies.
- Additional card types and effects.
- Improved match statistics and player dashboards.
- Advanced card search and filtering.

---

**Project:** Stormlight Archive Trading Card Game  
**Course:** DBMS Experiential Learning – Level 3
