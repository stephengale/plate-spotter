# Plate Spotter — Product Specification

## Overview

Plate Spotter is a single-page web app for tracking US license plates spotted during road trips or similar games. Players in a shared session each tap plates they spot; the app records occurrences per state and, via a long-press drill-down, per specific plate variant within a state.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML / CSS / Vanilla JS (SPA, no build step required) |
| Backend / DB | Firebase (Firestore + optional Cloud Functions) |
| Hosting | Netlify (static assets) |
| Images | Static files bundled with the app or hosted on Firebase Storage |

---

## Access Control

Access to the app is gated by a **universal access token** passed as a URL query parameter. There are no individual user passwords.

### Token Flow

1. User opens the app at `https://platespotter.example.com/?token=<value>`
2. On load, the frontend reads `token` from the query string
3. The token is checked against the `accessTokens` Firestore collection (see Data Model)
4. If the token is **valid and active**: proceed to User Selection
5. If the token is **invalid or missing**: show a full-screen error and halt

The token should be preserved in the URL throughout the session so the page can be refreshed or shared. The app must not remove the token from the URL.

> **Security note:** This is a low-stakes social game; token-in-URL is an acceptable trade-off. Do not display sensitive data. Tokens should be long random strings (≥ 32 chars).

---

## Data Model (Firestore)

### `accessTokens/{tokenId}`
```
{
  token:     string,   // the raw token value (indexed for query)
  active:    boolean,
  createdAt: timestamp
}
```

### `users/{userId}`
```
{
  name:      string,
  createdAt: timestamp
}
```

### `sessions/{sessionId}`
```
{
  name:       string,
  playerIds:  string[],  // ordered list of user IDs
  status:     "active" | "completed" | "discarded",
  startedAt:  timestamp,        // set when the session is first created
  savedAt:    timestamp | null, // updated each time a spot is written
  finishedAt: timestamp | null  // set when the player chooses Finish or Discard
}
```

### `sessions/{sessionId}/spots/{spotId}`
```
{
  playerId:  string,
  stateCode: string,   // e.g. "CA", "TX", "US_GOV"
  variantId: string | null,  // null = state-level tap; set on variant tap
  timestamp: timestamp
}
```

Counts are derived on the client by aggregating the `spots` sub-collection. Firestore real-time listeners keep all players' views in sync.

---

## Plate Catalog

The catalog is a static JSON file bundled with the app (`data/plates.json`). It describes every trackable plate.

### Top-level entries

- All 50 US states
- Washington DC
- US Government
- US Military (general)
- US territories: Puerto Rico, Guam, US Virgin Islands, American Samoa, Northern Mariana Islands

### Structure

```jsonc
[
  {
    "code": "CA",
    "label": "California",
    "image": "images/plates/state/ca_base.jpg",
    "variants": [
      { "id": "ca_standard",    "label": "Standard Blue Sky",  "image": "images/plates/variants/ca_standard.jpg" },
      { "id": "ca_veteran",     "label": "Veteran",            "image": "images/plates/variants/ca_veteran.jpg" },
      { "id": "ca_golden_bear", "label": "Golden Bear",        "image": "images/plates/variants/ca_golden_bear.jpg" }
    ]
  },
  {
    "code": "US_GOV",
    "label": "US Government",
    "image": "images/plates/state/us_gov.jpg",
    "variants": []
  }
]
```

States with no tracked variants still appear in the catalog with an empty `variants` array. Long-pressing a state with no variants does nothing (or shows a brief "no variants available" toast).

---

## Application Flow

### 1. Token Verification Screen

- Shown on first load while token is being checked
- Displays a loading spinner
- On failure: full-screen error message ("Invalid or missing access token"), no other UI

### 2. User Selection Screen

Shown after successful token verification.

- Lists all existing users by name (fetched from `users` collection, ordered by `createdAt` desc)
- **"+ New Player"** button opens an inline form: name input + confirm
  - Name must be non-empty and unique (case-insensitive check)
  - On save: creates user in Firestore, selects them automatically
- Tapping an existing user selects them and advances to Session Selection
- Selected user is stored in `sessionStorage` (so refresh within the same tab remembers them)

### 3. Session Selection Screen

- Shows the currently selected user's name and a "Switch Player" link
- Lists existing sessions ordered by `startedAt` desc; each row shows:
  - Session name and player count
  - **Started:** `startedAt` formatted as date + time
  - **Last saved:** `savedAt` (shown as "never" if null)
  - **Finished:** `finishedAt` (shown only when status is `"completed"` or `"discarded"`; label reads "Finished" or "Discarded" accordingly)
  - **Spot summary:** total spot count and types-spotted figure across all players in the session (e.g. `142 spots · 34 / 57 types`)
- **"+ New Session"** button opens a creation form:
  - Session name (required)
  - Player list: pre-populated with the current user; add more players by selecting from the users list
  - On confirm: creates session in Firestore, navigates to Game Screen
- Each session row has a **delete** (trash) icon button on the right
  - Tapping it opens a confirmation bottom sheet: **Delete** (destructive) and **Cancel**
  - On confirm: all spots in the session's sub-collection are deleted first, then the session document is deleted; the list refreshes
  - Deletion is permanent and cannot be undone
- Tapping anywhere else on a session row navigates to the Game Screen for that session

### 4. Game Screen — State Grid

The primary game view.

**Layout**

- Header bar: session name | current player name | player switcher icon | **End Session** button
- Summary bar (below the header): two stats for the current player in this session:
  - **Total spots** — sum of every top-level tap across all states (state-level + variant taps combined)
  - **Types spotted** — count of distinct top-level states that have at least one spot, shown as `X / Y` where Y is the total number of entries in the catalog (e.g. `23 / 57`)
- Scrollable tiled grid of plate images (one per catalog entry)
- Each tile shows:
  - Plate image (cropped to a standard aspect ratio, ~3:1)
  - State label below the image
  - Spot count badge (top-right corner of tile, hidden when count = 0); reflects only the **current player's** spots for this session
  - Variant progress label (bottom of tile, visible only when the state has variants): `X / Y variants` where X is the number of distinct variant types the current player has spotted and Y is the total number of variants defined for that state; hidden when the state has no variants

**Interactions**

| Gesture | Action |
|---|---|
| Tap | Increments the current player's spot count for that state by 1; writes a new `spot` document to Firestore |
| Long press (≥ 500 ms) | If the state has variants, navigates to the Variant Grid for that state; otherwise shows a toast "No variants for [State]" |
| Swipe / scroll | Normal scroll through the grid |

**Filtering / sorting** (stretch goal, not required for v1)
- Toggle between "All" and "Spotted" to hide zero-count plates

**Player switcher**
- Tapping the player switcher icon in the header shows a bottom sheet listing all session players
- Selecting a different player updates the active player; counts refresh to show that player's spots
- Does not require leaving the game screen

**End Session**
- Tapping the **End Session** button shows a confirmation bottom sheet with three actions:
  - **Save** — updates `savedAt` to the current timestamp, leaves `status` as `"active"`, and navigates back to Session Selection; the session can be resumed later
  - **Finish** — sets `status` to `"completed"` and `finishedAt` to the current timestamp; navigates back to Session Selection
  - **Discard** — sets `status` to `"discarded"` and `finishedAt` to the current timestamp; navigates back to Session Selection
- A fourth option, **Cancel**, dismisses the sheet without any change
- Discarded sessions are retained in Firestore but are hidden from the Session Selection list by default (the list only shows `"active"` and `"completed"` sessions)

### 5. Game Screen — Variant Grid

Entered by long-pressing a state tile that has variants.

**Layout**

- Back button + state name in header
- Same tiled grid pattern as the State Grid, but showing variant images for the selected state
- Each variant tile shows image, variant label, and the current player's spot count for that variant

**Interactions**

| Gesture | Action |
|---|---|
| Tap | Increments current player's spot count for that variant; writes a `spot` document with `variantId` set |
| Back | Returns to State Grid |

> Spots for a specific variant count **in addition to** state-level spots. The state tile's count badge shows the sum of all taps (state-level + all variant taps) for that state.

---

## Spot Count Logic

All figures are scoped to the **current player** and the **current session** unless otherwise noted.

**State tile — spot count badge**
```
state_count = spots where stateCode == state.code AND playerId == currentPlayer
              (includes both state-level taps and all variant taps for that state)
```

**State tile — variant progress label** (shown only when variants exist)
```
variants_spotted = distinct variantIds where stateCode == state.code
                   AND variantId != null AND playerId == currentPlayer
variants_total   = state.variants.length
display          = "{variants_spotted} / {variants_total} variants"
```

**Summary bar — total spots**
```
total_spots = count of all spots where playerId == currentPlayer
```

**Summary bar — types spotted**
```
types_spotted = count of distinct stateCodes where playerId == currentPlayer
catalog_total = plates.json entry count
display       = "{types_spotted} / {catalog_total}"
```

**Variant Grid — variant tile badge**
```
variant_count = spots where stateCode == state.code AND variantId == variant.id
                AND playerId == currentPlayer
```

All counts update in real time via a single Firestore listener on `sessions/{sessionId}/spots` attached when the session is opened. The client derives all of the above from that snapshot.

**Session list — spot summary** (all players combined, used on the Session Selection screen)
```
session_total_spots  = count of all spots in sessions/{sessionId}/spots
session_types_spotted = count of distinct stateCodes across all players
display              = "{session_total_spots} spots · {session_types_spotted} / {catalog_total} types"
```

**`savedAt` maintenance** — each time a `spot` document is written, the client also updates `sessions/{sessionId}.savedAt` to the current timestamp. This is a best-effort write; it does not need to be atomic with the spot write.

---

## Firebase Configuration

### Firestore Security Rules (outline)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Token validation: client-side read only
    match /accessTokens/{id} {
      allow read: if true;
      allow write: if false;
    }

    // Users: anyone with app access can read/create
    match /users/{userId} {
      allow read, create: if true;
      allow update, delete: if false;
    }

    // Sessions and spots
    match /sessions/{sessionId} {
      allow read, create: if true;
      allow update: if true;   // needed for status changes
      allow delete: if false;

      match /spots/{spotId} {
        allow read, create: if true;
        allow update, delete: if false;
      }
    }
  }
}
```

> For a production hardening pass: require that the access token be verified server-side (via a Firebase Cloud Function callable) before issuing a Firebase Auth anonymous token, and lock all Firestore rules to require `request.auth != null`.

### Firebase Config

Firebase project config (API key, project ID, etc.) is stored in a `firebase-config.js` file that is **not committed to source control**. It is injected at deploy time via Netlify environment variables and a Netlify build plugin or simple build script.

---

## Netlify Deployment

- No build step required for v1 (pure static files)
- `netlify.toml` at project root:

```toml
[build]
  publish = "."

[[redirects]]
  from = "/*"
  to   = "/index.html"
  status = 200
```

- The redirect rule ensures refreshing the SPA with a token in the URL works correctly
- Firebase project config values are set as Netlify environment variables and written into `firebase-config.js` by a Netlify build plugin or a lightweight `netlify/plugins/inject-config` script

---

## File Structure (proposed)

```
plate-spotter/
├── index.html
├── netlify.toml
├── css/
│   └── app.css
├── js/
│   ├── app.js          # router / bootstrapper
│   ├── auth.js         # token verification
│   ├── db.js           # Firestore helpers
│   ├── screens/
│   │   ├── user-select.js
│   │   ├── session-select.js
│   │   ├── game.js
│   │   └── variant.js
│   └── firebase-config.js   # gitignored; injected at deploy
├── data/
│   └── plates.json
└── images/
    └── plates/
        ├── state/      # one base image per catalog entry
        └── variants/   # one image per variant
```

---

## Out of Scope (v1)

- User authentication beyond the shared access token
- Leaderboards or cross-session totals
- Offline / PWA support
- Admin UI for managing tokens or sessions
- Undo / decrement for accidental taps (stretch: double-tap to undo last tap)
- Photo capture of spotted plates
