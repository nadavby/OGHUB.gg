# OGHub Platform Visual & Brand Overhaul — Design Spec

**Date:** 2026-04-06
**Status:** Approved

## Overview

Rebrand the OGHub web platform from "Neon-Noir / Las Vegas meets Cyberpunk" to a clean, dark, premium competitive identity. The platform is a skill-based competition platform where users create rooms, set stakes, and compete for real money. The design must feel trustworthy with money, addictive through identity investment, and differentiated from cheap gambling sites.

**Brand positioning:** "Premium skill-based competition. Put your money where your mouth is."

**Design philosophy:** Clean, confident, dark. Borrows from fintech for money screens (trust, clarity) and from esports for competition screens (energy, identity). No manufactured urgency. Real activity, real stakes, real results.

**Reference platforms:** Stake (dark premium UI, dopamine loops), FaceIt (competitive ladder, orange energy), Triumph (skill-game-for-money model), DuelBits (engagement hooks).

## Core Mental Model

The platform has two distinct competition types:

- **Rooms (user-created, the core):** Users create rooms with their own terms — format (1v1, best of 3, pool of 10), entry fee, game. Other users browse and join. This is peer-to-peer competition. The platform facilitates and takes a cut.
- **Events (platform-run, separate section):** Platform creates large-scale tournaments (everyone vs everyone). Fixed prizes for top places, entry fee to participate. Rare and high-value (weekly/bi-weekly), creating calendar-based FOMO.

## Color System

Psychology-driven palette based on competitive gaming and fintech UX research.

| Role | Token | Hex | Psychology / Usage |
|------|-------|-----|-------------------|
| Background | `--bg` | `#0D0D0D` | Near-black (not pure black — avoids eye strain). Dark = premium perception, longer sessions, content focus |
| Surface | `--surface` | `#161616` | Cards, panels. Subtle contrast layer |
| Surface elevated | `--surface-elevated` | `#1E1E1E` | Hover states, modals, bottom sheets |
| Surface active | `--surface-active` | `#252525` | Pressed states, selected items |
| Border | `--border` | `rgba(255,255,255,0.08)` | Card edges, dividers |
| Border hover | `--border-hover` | `rgba(255,255,255,0.15)` | Interactive element hover |
| Primary (Action) | `--primary` | `#F97316` | Orange. CTAs, active nav, competitive energy. FaceIt-proven: signals ambition, not casino |
| Primary hover | `--primary-hover` | `#FB923C` | Lighter orange for hover |
| Primary dim | `--primary-dim` | `rgba(249,115,22,0.15)` | Subtle backgrounds on active elements |
| Win/Success | `--win` | `#10B981` | Emerald. Money-positive states only: wins, balance increases, payouts. Pavlovian: green = you made money |
| Money | `--money` | `#F59E0B` | Amber. Prize pools, entry fees, wallet balance. Gold = wealth aspiration, used sparingly |
| Danger/Loss | `--danger` | `#EF4444` | Red. Losses, errors, insufficient balance. Never for CTAs |
| Trust | `--trust` | `#3B82F6` | Blue. Deposit buttons, payment screens, verification badges. "Digital handshake" |
| Text primary | `--text-primary` | `#EBEBEB` | Headings, important content |
| Text secondary | `--text-secondary` | `#8A8A8A` | Labels, descriptions |
| Text muted | `--text-muted` | `#505050` | Timestamps, hints |

### Color Rules

- Orange is the single dominant accent. It does all heavy lifting for CTAs and active states.
- Green appears only when the user gains money (win, payout, balance increase).
- Blue appears only on trust-bearing elements (deposit, withdraw, security, payment logos).
- Amber appears only next to monetary values (entry fees, prize pools, balance).
- Red appears only for negative states (loss, error, insufficient funds).
- No neon glows, no gradients on surfaces, no shimmer effects.

## Typography

Kept from current system — these are good choices:

| Role | Font | Usage |
|------|------|-------|
| Display | Outfit (600-800 weight) | Page titles, section headers, room names |
| Body | Inter (400-600 weight) | Descriptions, labels, body text |
| Mono | JetBrains Mono (400-700 weight) | Money amounts, scores, stats, countdowns |

### Scale

- Page title: 24px, Outfit 700
- Section header: 18px, Outfit 600
- Body: 14px, Inter 400
- Small: 12px, Inter 400
- Money (large): 28px, JetBrains Mono 700
- Money (inline): 14px, JetBrains Mono 600
- Stat value: 20px, JetBrains Mono 700

## Effects Policy

### Kill (remove entirely)

- Ambient background radial gradients
- SVG noise texture overlay
- Shimmer animations on buttons
- Neon glow box-shadows (`--shadow-neon`, `--shadow-neon-strong`)
- Pulsing gold tags
- Floating particle animations
- Scale-bounce hover effects
- Gradient text on headers

### Keep

- `backdrop-filter: blur(12px)` on header only
- Safe-area insets for notched devices
- Framer Motion for page transitions (simplified)

### Add

- Subtle `translateY(-1px)` hover lift on cards (with `transition: 0.15s ease`)
- Opacity transitions on interactive elements (0.15s)
- Number tick-up animation on score counters and balance changes (JetBrains Mono, counting up to final value)
- Green flash on balance increase, red flash on balance decrease (200ms background color pulse)
- Subtle orange pulse on primary CTA (2s interval, opacity 0.8→1.0, very restrained)

## Layout & Navigation

### App Shell

- Max-width: 480px (mobile-native platform, centered on larger screens)
- Background: `--bg` (`#0D0D0D`)
- Content padding: 16px horizontal

### Header (fixed, 56px)

- Left: "OGHUB" wordmark — Outfit 800, white, orange dot on the "O" (subtle brand mark)
- Right: wallet balance chip (amber text, `--border` border, 8px padding, rounded-full) + user avatar circle (32px)
- Background: `rgba(13,13,13,0.85)` + `backdrop-filter: blur(12px)`
- Bottom border: `--border`

### Bottom Navigation (fixed, 64px)

4 tabs:

| Tab | Icon | Destination |
|-----|------|-------------|
| Home | House SVG | Games feed + open rooms |
| Events | Trophy SVG | Platform-run tournaments |
| Wallet | Wallet SVG | Balance, deposit, withdraw, history |
| Profile | User SVG | Competitive identity, active rooms, history, settings |

- Clean SVG icons (no emojis), 20px, label text below (11px, Inter 500)
- Active state: orange icon + orange label + 2px orange bar on top edge
- Inactive: `#505050`
- No glow effects, no scale animations
- Safe-area padding at bottom for notched devices

### Page Transitions

- Simple opacity crossfade (200ms ease) between tabs
- No slide-in, no spring physics

## Pages

### Home Page

Top to bottom:

**1. Live Activity Bar**
- Single-line horizontal scroll of real platform activity
- Examples: "PlayerX won $45 on Neon Runner" • "3 active events" • "127 players online"
- Text: 12px, Inter 400, `--text-muted`
- No animation except scroll. If no activity, hide entirely.
- Real data only — never fabricated.

**2. Active Rooms Section**
- Header: "Open Rooms" with orange dot indicator if rooms available
- Horizontal scroll of room cards for quick access (across all games):
  - Game name (small, `--text-secondary`)
  - Creator: "@username"
  - Format: "1v1" / "1v1 Bo3" / "FFA 10"
  - Entry fee (amber) | Prize pool (white bold)
  - Spots: "1/2" with small fill bar
  - "Join" button (orange, compact)
- This serves returning users who want instant action

**3. Games Grid**
- Header: "Games"
- Tag filter: horizontal pill row (All, Runner, Shooter, Puzzle, Racing)
  - Active: orange background, white text
  - Inactive: `--border` border, `--text-secondary` text
- Game Cards:
  - Surface: `--surface`, 1px `--border`, `--radius-md` (12px)
  - Game thumbnail (16:9, top, rounded top corners)
  - Game title: 16px, Outfit 600, `--text-primary`
  - Description: 13px, Inter 400, `--text-secondary`, single line truncated
  - Bottom row: active room count + player count, 12px, `--text-muted`
  - Tap: navigates to Game Detail page
  - Hover: border → `--border-hover`, `translateY(-1px)`
  - No difficulty stars, no "HOT" badge, no shimmer, no "Play Now" button

### Game Detail Page

**1. Game Header**
- Full-width banner image (16:9, edge-to-edge)
- Game title overlaid at bottom of banner: 24px, Outfit 700, white, text-shadow for readability
- Below banner: one-line description + "by [developer]" in `--text-secondary`

**2. Open Rooms**
- Header: "Open Rooms"
- List of rooms waiting for players:
  - Left section: creator avatar (24px circle) + username (14px, `--text-primary`)
  - Center: format badge ("1v1" / "Bo3" / "FFA 10") — small pill, `--surface-elevated` bg
  - Right section: entry fee (amber, mono) → prize pool (white bold, mono)
  - Below: spots progress bar (orange fill on `--surface-active` track), e.g. "3/10 players"
  - Tap row → opens Join bottom sheet
- Sorted by: most filled first (real scarcity)
- Empty state: "No open rooms yet" with Create Room button

**3. Create Room Button**
- Sticky at bottom of scroll area (above bottom nav)
- "Create Room" — full width, orange background, white text, 48px height
- Opens Create Room bottom sheet

**4. Leaderboard Preview**
- Header: "All-Time Top Players" with "See All →" link
- Top 5 rows: rank (#1 in orange, rest in `--text-muted`), username, score (mono)
- Clean rows, no podium, no medals

**5. Game Stats Footer**
- Small text row: "1,240 games played • $12,450 paid out • 89 active players"
- `--text-muted`, 12px — trust through real data

### Create Room Bottom Sheet

Slides up from bottom, dark overlay behind.

- Header: "Create Room" with X close button
- **Game:** shown but not editable (you're on the game page)
- **Format selector:** horizontal pill group
  - "1v1" | "1v1 Bo3" | "FFA 5" | "FFA 10" | "FFA 20"
  - Active: orange bg. Inactive: `--surface-elevated` bg
- **Entry Fee:** input field with quick-pick chips below ($1, $5, $10, $25)
  - Input: JetBrains Mono, amber text, `--surface` bg
  - Chips: `--surface-elevated` bg, tap to fill input
- **Prize breakdown** (auto-calculated, shown below):
  - "Prize Pool: $X.XX" (white, bold)
  - "Platform Fee: X%" (`--text-muted`)
  - For FFA formats: "1st: $X / 2nd: $X / 3rd: $X"
- **"Create & Enter"** button — orange, full width
- After creation: room appears in Open Rooms, shareable link generated, user is auto-entered and waiting

### Join Room Bottom Sheet

Slides up when tapping an open room.

- Room summary: "1v1 vs @PlayerX — Neon Runner" (or "FFA 10 — Neon Runner")
- Entry fee: large amber mono text
- Prize pool: large white mono text
- Your balance: shown below — green if sufficient, red if insufficient
- If sufficient: **"Join Room"** button (orange, full width)
- If insufficient: **"Deposit $X.XX to Join"** button (blue, trust-coded)
- Below button: "Score validated by anti-cheat 🛡️" — small, `--text-muted`
- On join when room fills: deep link fires → game launches on device

### Events Page

**1. Featured Event (large card, top)**
- Banner image, full width
- Event name: 20px, Outfit 700
- Game name: 14px, `--text-secondary`
- Prize pool: large amber mono ("$500 Prize Pool")
- Entry fee: smaller amber
- Player count + time window: "Ends Sunday 11:59 PM"
- Format description: "Everyone plays, top 10 win"
- **"Enter Event"** button (orange)

**2. Events List (below)**
- Tabs: "Live" | "Upcoming" | "Past"
- Each row:
  - Event name + game name
  - Entry fee | Prize pool
  - Status indicator: green dot "Live" / gray "Starts in 2h" / `--text-muted` "Ended"
  - Player count
- Tap → Event Detail page

**Event Detail Page:**
- Event info (name, game, rules, prize breakdown per place)
- Live leaderboard with your position highlighted (orange border on your row)
- Time remaining (if live)
- "Enter Event" or "Already Entered" state
- After event ends: final standings with prize distribution shown

### Wallet Page (Fintech-Grade)

**1. Balance Card**
- Balance amount: 28px, JetBrains Mono 700, amber
- No glow, no shimmer — clean big number on `--surface` card
- Two buttons below, side by side:
  - **"Deposit"** (blue background `--trust`, white text)
  - **"Withdraw"** (ghost button, `--border` border, `--text-primary` text)

**2. Quick Stats Row**
- Three stats in a row: Total Deposited | Total Won | Total Withdrawn
- Values: 16px, JetBrains Mono 600
- Labels: 11px, Inter 400, `--text-muted`
- Builds trust through transparency

**3. Transaction History**
- Header: "Transactions"
- Each row:
  - Left: SVG icon (↓ deposit, → entry fee, ← prize, ↑ withdrawal) + description
  - Right: amount (green positive, red negative, JetBrains Mono) + date below (`--text-muted`, 11px)
- No emojis — clean monochrome SVG icons
- Sorted most recent first

**Deposit Flow (bottom sheet):**
- Header: "Add Funds"
- Quick amount chips: $5, $10, $25, $50, $100
- Custom amount input
- Payment method selector (when integrated: Stripe, etc.)
- **"Deposit"** button (blue)
- "Withdraw anytime" text visible — reduces commitment anxiety

**Withdrawal Flow (bottom sheet):**
- Header: "Withdraw"
- Available balance shown
- Amount input
- Withdrawal method selector
- Processing time note: "Usually within 24 hours"
- **"Withdraw"** button (outlined)

### Profile Page (Competitive Identity)

**1. Player Card**
- Avatar (64px circle), display name (Outfit 600), @username (`--text-secondary`)
- Member since date
- **Stat row** (3 columns):
  - Games Played | Win Rate | Total Earnings
  - Values: 20px, JetBrains Mono 700
  - Labels: 11px, `--text-muted`
  - Total Earnings in amber

**2. Active Rooms**
- Header: "Your Active Rooms" (only shown if any)
- Cards showing rooms you created or joined:
  - Game + opponent(s) + format
  - Status: "Waiting for opponent" (pulsing orange dot) / "Ready — Launch Game" (orange button) / "Completed" (with result)
- This section creates the natural "open the app and check" trigger

**3. Match History**
- Header: "Match History"
- Reverse chronological list:
  - Game icon (small) + opponent(s) + format
  - Result: "W" (green) or "L" (red)
  - Score (mono)
  - Money: "+$4.50" (green) or "-$5.00" (red)
- Tap → match detail with full stats (scores, opponent info, timestamps)

**4. Achievements / Milestones**
- Small horizontal scroll of earned badges:
  - "10 Wins", "First $100 Earned", "5 Win Streak", "Event Winner"
  - Earned: orange icon on `--surface` card
  - Unearned: faded, `--text-muted`
- Identity investment — these build over time and give reasons to keep playing

**5. Settings**
- Account settings, notification preferences, payment methods, logout
- Clean list rows with chevron icons

## Onboarding Flow (First-Time Users)

**Step 1: Registration**
- Clean form: email, username, password
- Minimal fields, no KYC at registration
- "Create Account" button (orange)

**Step 2: Guided Intro (3 swipeable screens)**
- Screen 1: "Browse games. Join rooms. Compete for real money." (illustration of game cards)
- Screen 2: "Create your own rooms — you set the stakes." (illustration of room creation)
- Screen 3: "Here's $5 to get started. Show us what you've got." (balance animation counting up to $5.00)
- Skip button available on all screens
- "Let's Go" on final screen

**Step 3: Land on Home**
- $5 balance visible in header wallet chip
- First game card has a one-time subtle orange left border ("Start Here" nudge)
- After first game is played, nudge disappears permanently

**Deposit Trigger (when free credits run out):**
- User tries to join a room, balance insufficient
- Join sheet shows: "You need $X more"
- **"Deposit"** button (blue) replaces the Join button
- Deposit sheet opens with the exact needed amount pre-filled
- After deposit → returns to the room, auto-continues join flow
- "Withdraw anytime" shown on deposit screen — critical for first-deposit conversion

## Retention Hooks (Smart, Premium)

All hooks follow the principle: **descriptive, not prescriptive**. Show authentic activity and let the user draw their own conclusion.

### Streaks
- Daily login earns a streak day
- Streak counter visible on Profile (small, not obnoxious)
- Missing a day resets counter — no punishment, no guilt notification
- Milestone streaks (7, 30, 100 days) earn a profile badge
- No money reward for streaks — streaks are about identity, not bribery

### Rankings
- Monthly leaderboard per game
- Top players earn a badge for that month visible on their profile
- "January 2026 #1 — Neon Runner" type badge
- Rankings reset monthly — creates recurring competition cycles

### Near-Miss Feedback
- After a close loss: "You placed #2 — $2.30 from the prize. Rematch?"
- Factual, not manipulative. Shows what happened and offers a natural next action.
- Only shown when the gap is genuinely small (within 20% of winning threshold)

### Social (when friends system is added later)
- "Your friend @X just created a room" — real social proof
- "You passed @X on the Neon Runner leaderboard" — upward comparison motivation
- Never fake notifications, never manufactured urgency

### Milestones
- Profile achievements: "10 Wins", "First $100 Earned", "5 Win Streak", "Event Top 3"
- Unlocked achievements appear with a subtle toast notification
- Displayed on profile as earned badges — building the competitive identity

## Components to Remove

| Component | Reason |
|-----------|--------|
| `DoubleOrNothing` | Off-brand. Pure gambling, not skill-based. |
| `UrgencyBanner` | Manufactured FOMO. Cheap gambling pattern. |
| `LiveWinnersTicker` | Replaced by subtle Live Activity Bar with real data. |
| `RewardAnimation` | Casino-style flashy celebration. Replace with clean balance update animation. |
| `NearMissToast` | Redesign as part of result screen (factual, not pushy). |
| All shimmer CSS animations | Off-brand. Premium = restrained. |
| Neon glow box-shadows | Off-brand. Clean shadows only. |
| Ambient gradient backgrounds | Off-brand. Solid `--bg` background. |
| Noise texture overlay | Off-brand. Clean surfaces. |
| Emoji icons in nav | Replace with clean SVG icons. |

## Components to Add

| Component | Purpose |
|-----------|---------|
| Live Activity Bar | Real-time platform activity (descriptive social proof) |
| Room Card | Display an open room (creator, format, fee, prize, spots) |
| Room Creation Sheet | Bottom sheet for creating a room |
| Room Join Sheet | Bottom sheet for joining a room |
| Event Card | Display a platform event |
| Event Detail Page | Full event view with leaderboard |
| Player Card | Profile header with stats |
| Match History Row | Single match result display |
| Achievement Badge | Profile milestone indicator |
| Onboarding Screens | 3-screen guided intro |
| Deposit Sheet | Bottom sheet deposit flow |
| Withdrawal Sheet | Bottom sheet withdrawal flow |
| Result Screen (web) | Post-game result display on platform |

## API Changes Required

| Change | Description |
|--------|-------------|
| Rename "Challenge" concept to "Room" | Throughout API and DB. Rooms are user-created. |
| `POST /api/rooms/create` | User creates a room (format, entry fee, game) |
| `GET /api/rooms` | List open rooms (filterable by game) |
| `POST /api/rooms/:id/join` | Join a room |
| `GET /api/rooms/:id` | Room detail |
| Room model changes | Add: `format` (1v1/bo3/ffa5/ffa10/ffa20), `roundCount`, `createdByUserId` |
| `POST /api/events` | Admin-only: create platform event |
| `GET /api/events` | List events (live/upcoming/past) |
| `POST /api/events/:id/enter` | Enter an event |
| `GET /api/events/:id/leaderboard` | Event leaderboard |
| `GET /api/users/:id/stats` | Player stats (games, win rate, earnings) |
| `GET /api/users/:id/history` | Match history |
| `POST /api/users/onboard` | Mark onboarding complete, credit $5 |
| Remove `POST /api/wallet/double-or-nothing` | Off-brand feature removal |

## Room Lifecycle & Rules

### Formats

| Format | Players | Rounds | Win Condition |
|--------|---------|--------|--------------|
| 1v1 | 2 | 1 | Higher score wins |
| 1v1 Bo3 | 2 | 3 | Win 2 of 3 rounds (different seed each round) |
| FFA 5 | 5 | 1 | Highest score wins |
| FFA 10 | 10 | 1 | Top 3 win prizes |
| FFA 20 | 20 | 1 | Top 3 win prizes |

### Prize Distribution (after platform fee)

- **1v1 / 1v1 Bo3:** Winner takes 100% of prize pool
- **FFA 5:** 1st: 70%, 2nd: 30%
- **FFA 10:** 1st: 50%, 2nd: 30%, 3rd: 20%
- **FFA 20:** 1st: 50%, 2nd: 30%, 3rd: 20%

### Room States

`WAITING` → `READY` → `IN_PROGRESS` → `COMPLETED`

- **WAITING:** Room created, accepting joins. Creator is auto-entered.
- **READY:** All spots filled. Deep links fire for all players. 60-second countdown to launch.
- **IN_PROGRESS:** Players are playing. Sessions tracked server-side.
- **COMPLETED:** All scores submitted. Prizes distributed.

### Room Rules

- Rooms auto-expire after 30 minutes if not filled. Creator gets entry fee refunded.
- Creator cannot leave a room they created (entry fee is locked). They can cancel before anyone joins (full refund).
- If a player disconnects during IN_PROGRESS, their session still has its normal timeout. No special handling — their score stands as-is.
- Minimum entry fee: $0.50. Maximum entry fee: $100. (Prevents dust abuse and money laundering.)
- A user can only be in 3 active rooms at a time (prevents room flooding).

### Best of 3 Flow

1. Room fills → both players get seed #1 → play round 1
2. Scores submitted → round result shown ("Round 1: You 1,240 — Opponent 980")
3. Seed #2 sent → play round 2
4. If 2-0 after round 2: match over, winner gets prize
5. If 1-1: seed #3 sent → play round 3 → final result

Each round uses a different server-generated seed. Scores are independent per round — it's win count, not aggregate.

## Database Changes Required

| Change | Description |
|--------|-------------|
| Add `Room` model | New model (do not rename Challenge — Challenge is repurposed for Events) |
| `Room.format` | Enum: ONE_V_ONE, BEST_OF_3, FFA_5, FFA_10, FFA_20 |
| `Room.status` | Enum: WAITING, READY, IN_PROGRESS, COMPLETED, EXPIRED, CANCELLED |
| `Room.entryFee` | Decimal |
| `Room.prizePool` | Decimal (auto-calculated) |
| `Room.gameId` | FK to Game |
| `Room.createdByUserId` | FK to User |
| `Room.maxPlayers` | Integer (derived from format) |
| `Room.expiresAt` | DateTime (30 min after creation) |
| `RoomParticipant` model | Join table: roomId, userId, joinedAt, sessionId (nullable) |
| Repurpose `Challenge` for Events | Challenge model stays but is used only for platform Events |
| Add `Event` model (or reuse Challenge with type flag) | Platform-run tournaments with fixed prizes |
| Add `Event.prizeBreakdown` | JSON field with per-place prize amounts |
| Add `Achievement` model | userId, type (enum), earnedAt |
| Add `UserStats` | Computed or materialized: gamesPlayed, winCount, totalEarnings |

## Scope Boundaries

**In scope (this spec):**
- Complete visual rebrand (colors, typography, effects)
- Navigation restructure (4 tabs)
- All page redesigns (Home, Game Detail, Events, Wallet, Profile)
- Room system (create, join, list)
- Onboarding flow with free credits
- Retention hooks (streaks, rankings, near-miss, milestones)
- Component cleanup (remove off-brand, add new)
- API and DB changes for rooms and events

**Out of scope (separate specs):**
- Real payment integration (Stripe) — separate spec #2
- Social features (friends, friend activity) — separate spec #3
- NeonRunner game refinement — separate project
- Push notifications infrastructure
- Admin panel
- KYC/identity verification
