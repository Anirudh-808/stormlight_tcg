# Frontend implementation notes

This update adds a basic, functionality-first Next.js interface.

## Pages

- `/` landing page
- `/register` account registration
- `/login` login
- `/dashboard` player dashboard
- `/collection` owned cards with search/filter and detail dialog
- `/decks` deck list/create
- `/decks/[deckId]` deck editing, card add/remove and validation
- `/profile` profile update and password change
- `/store` pack-opening preview (demo only; no pack API exists yet)
- `/battle` local battle interaction preview (demo only; no match APIs exist yet)
- `/history` pending backend match-history endpoint

## Backend API routes used

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET|PUT /api/players/profile`
- `GET /api/players/collection`
- `GET|POST /api/decks`
- `GET|PUT|DELETE /api/decks/:deckId`
- `POST /api/decks/:deckId/cards`
- `DELETE /api/decks/:deckId/cards/:cardId` (request body: `{ "quantity": number }`)
- `GET /api/decks/:deckId/validate`

The frontend uses the actual route paths currently present on the `backend` branch. The backend validation endpoint is `GET`, even though the API contract document describes `POST`.

## Known backend dependencies not yet available

Pack listing/purchase, card catalogue, match creation, match actions and match history are not currently available on the backend branch. Store and battle pages are labelled as local demo previews; match history explains the missing dependency. They do not claim to persist data.

## Setup

1. Use the `frontend` branch.
2. Coordinate with the backend owner to integrate the latest `backend` branch changes into the local frontend working tree. The frontend branch was identical to `main`, and backend was a fast-forward of five commits when this update was prepared.
3. Copy `.env.example` to `.env.local` and fill in local credentials. Never commit `.env.local` or real secrets.
4. Ensure MySQL schema includes `PLAYER.role` (`PLAYER` or `ADMIN`) because auth and authorization queries read this column.
5. Ensure MySQL uses database `tcg` and MongoDB uses database `stormlight_tcg` with collection `card_details`.
6. Run `npm install` and `npm run dev`.

## Verification

- Open `/api/health` after the backend routes are integrated and both databases are running.
- Register an account, then log in.
- Verify the dashboard and collection load.
- Create a deck, add/remove owned cards, and validate the deck.
- Confirm logout sends the user back to the landing page.
