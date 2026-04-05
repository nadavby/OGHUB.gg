# OGHub Generic SDK - Design Spec

**Date:** 2026-04-05
**Status:** Approved

## Overview

Rebuild the OGHub SDK from a NeonRunner-specific implementation into a generic, plug-and-play SDK that works with any game type (runner, shooter, puzzle, racing, etc.) across all major game engines. The SDK is protocol-based (HTTP + WebSocket) with thin native wrappers per engine. Games self-describe via a Game Definition file (`oghub.game.yaml`), and a Trust Tier system scales anti-cheat enforcement based on what validation the game supports.

## Goals

- **Plug-and-play:** A developer integrates the SDK in ~6 lines of code, regardless of game type
- **Engine-agnostic:** Unity, Unreal, Godot, and Web supported from day one via native wrappers
- **Secure by default:** Multi-layer anti-cheat that scales with Trust Tier
- **Developer-friendly:** Config-file-first approach (`oghub.game.yaml`), distributed via standard package managers

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 Game (Any Engine)                │
│  ┌───────────────────────────────────────────┐   │
│  │         Engine-Specific Wrapper           │   │
│  │    (Unity / Unreal / Godot / Web)         │   │
│  └──────────────┬────────────────────────────┘   │
│  ┌──────────────▼────────────────────────────┐   │
│  │          OGHub SDK Core (Protocol)        │   │
│  │  ┌─────────┐ ┌──────────┐ ┌───────────┐  │   │
│  │  │ Session │ │ Events   │ │ AntiCheat │  │   │
│  │  │ Manager │ │ Reporter │ │ Client    │  │   │
│  │  └─────────┘ └──────────┘ └───────────┘  │   │
│  │  ┌─────────┐ ┌──────────┐ ┌───────────┐  │   │
│  │  │ Replay  │ │ WebSocket│ │ Integrity │  │   │
│  │  │ Recorder│ │ Channel  │ │ Guard     │  │   │
│  │  └─────────┘ └──────────┘ └───────────┘  │   │
│  └──────────────┬────────────────────────────┘   │
└─────────────────┼───────────────────────────────┘
                  │ HTTPS + WSS
┌─────────────────▼───────────────────────────────┐
│              OGHub Platform API                  │
│  ┌──────────┐ ┌───────────┐ ┌────────────────┐  │
│  │ Session  │ │ Event     │ │ Game Registry  │  │
│  │ Service  │ │ Pipeline  │ │ (Definitions)  │  │
│  └──────────┘ └───────────┘ └────────────────┘  │
│  ┌──────────┐ ┌───────────┐ ┌────────────────┐  │
│  │ Fraud    │ │ Trust     │ │ Live Validator │  │
│  │ Engine   │ │ Tier Mgr  │ │ (WebSocket)    │  │
│  └──────────┘ └───────────┘ └────────────────┘  │
└─────────────────────────────────────────────────┘
```

**Principle:** SDK Core is protocol-only (HTTP + WebSocket). Each engine gets a thin wrapper that translates the API to engine-native conventions (coroutines in Unity, async/await in Web, delegates in Unreal, signals in Godot).

## Game Definition Protocol

Every game registers itself with an `oghub.game.yaml` file that lives in the game's repo:

```yaml
# oghub.game.yaml
name: "Space Blaster"
slug: "space-blaster"
version: "1.0.0"
engine: unity

# What inputs does this game have?
inputs:
  - name: shoot
    type: action          # action = discrete event
  - name: move
    type: vector2         # vector2 = continuous axis
  - name: aim
    type: vector2
  - name: reload
    type: action
  - name: use_ability
    type: action
    metadata:
      ability_id: string

# How scoring works
scoring:
  range: [0, 999999]
  method: accumulative    # accumulative / time_based / objective_based / custom
  components:
    - name: kills
      weight: 100
    - name: accuracy_bonus
      weight: 50
    - name: survival_time
      weight: 1

# Session rules
session:
  max_duration: 300s
  min_duration: 10s
  allow_pause: false
  lives: 1

# Anti-cheat tuning per game
anticheat:
  max_input_rate: 30/s
  min_reaction_time: 50ms
  max_score_per_second: 5000
  custom_rules:
    - name: impossible_accuracy
      condition: "accuracy > 0.99 AND shots > 50"
      severity: high
    - name: zero_movement
      condition: "move_events == 0 AND score > 1000"
      severity: critical

# Trust tier configuration
trust:
  tier: standard          # basic / standard / verified
  replay_format: native
  # verified tier requires:
  # replay_simulator: "docker://space-blaster-sim:latest"

# State snapshots for live validation
validation:
  snapshot_interval: 5s
  required_fields:
    - player_health
    - player_position
    - current_score
    - enemies_alive
```

### Input types

| Type | Description | Example |
|------|-------------|---------|
| `action` | Discrete event (press) | shoot, jump, reload |
| `vector2` | 2D continuous axis | move, aim |
| `vector3` | 3D continuous axis | 3D movement |
| `scalar` | Single numeric value | throttle, zoom |
| `toggle` | On/off state | crouch, sprint |

### Scoring methods

| Method | Description | Use case |
|--------|-------------|----------|
| `accumulative` | Score increases over time | Runner, shooter |
| `time_based` | Fastest time wins | Racing, speedrun |
| `objective_based` | Complete objectives | Puzzle |
| `custom` | Game calculates, server validates range | Complex scoring |

## SDK Core API

Universal interface - same contract across all engines:

```typescript
interface OGHubSDK {
  // === Lifecycle ===
  init(config: {
    apiKey: string
    gameSlug: string
    environment?: 'production' | 'sandbox'
  }): Promise<void>

  // === Session ===
  createSession(options?: {
    challengeId?: string
    metadata?: Record<string, any>
  }): Promise<Session>
  startSession(): void
  endSession(): Promise<SessionResult>

  // === During Gameplay ===
  reportInput(input: GameInput): void
  reportEvent(event: GameEvent): void
  updateScore(score: number): void
  updateState(state: Record<string, any>): void

  // === Callbacks (server-initiated via WebSocket) ===
  onValidationRequest(handler: () => StateSnapshot): void
  onSessionKill(handler: (reason: string) => void): void
  onLeaderboardUpdate(handler: (update: LeaderboardEntry[]) => void): void

  // === Ghost / Replay ===
  getGhostData(challengeId: string): Promise<GhostReplay | null>
}

interface GameInput {
  name: string                    // must match inputs in game definition
  data?: Record<string, any>
  // timestamp + sequence auto-assigned by SDK
}

interface GameEvent {
  type: string
  data?: Record<string, any>
}

interface Session {
  id: string
  seed: string
  config: SessionConfig
  ghostData?: GhostReplay
}

interface SessionResult {
  accepted: boolean
  score: number
  rank?: number
  nearMiss?: NearMissInfo
  reason?: string
}
```

### Transparent SDK Internals

These run behind the scenes with zero developer effort:

| Mechanism | What happens | Developer sees? |
|-----------|-------------|-----------------|
| HMAC Signing | Every request signed with apiSecret + nonce + timestamp | No |
| Replay Recording | Every `reportInput` saved to local buffer | No |
| WebSocket keepalive | Heartbeat + auto reconnect | No |
| Validation responses | Server requests snapshot, callback called, response sent | Only the callback |
| Offline queue | Failed submissions cached and retried | No |
| Integrity checks | Memory checksums, timing validation | No |
| Score hash chain | Every `updateScore` creates hash chain to prevent tampering | No |

## Engine Wrappers

### Unity (C#)
```csharp
// com.oghub.sdk via UPM
public static class OGHub
{
    public static async Awaitable Init(string apiKey, string gameSlug);
    public static async Awaitable<Session> CreateSession(...);
    public static void StartSession();
    public static async Awaitable<SessionResult> EndSession();
    public static void ReportInput(InputData input);
    public static void UpdateScore(int score);
    public static void UpdateState(Dictionary<string, object> state);
    public static Action<Func<Dictionary<string, object>>> OnValidationRequest;
    public static Action<LeaderboardEntry[]> OnLeaderboardUpdate;
}
```

### Web (TypeScript)
```typescript
// npm install @oghub/sdk
import { OGHub } from '@oghub/sdk'
const og = new OGHub({ apiKey: '...', gameSlug: 'my-game' })
```

### Unreal (C++)
```cpp
// Marketplace or .uplugin
#include "OGHub/OGHubSDK.h"
UOGHubSDK* SDK = UOGHubSDK::Get();
SDK->Init(ApiKey, GameSlug);
```

### Godot (GDScript)
```gdscript
# AssetLib → OGHub SDK
var oghub = OGHub.new()
oghub.init(api_key, "my-game")
```

### Engine conventions mapping

| | Unity | Web | Unreal | Godot |
|---|---|---|---|---|
| Async | Awaitable/Coroutine | Promise | Delegates/Callbacks | await signal |
| Distribution | UPM git URL | npm | Marketplace/.uplugin | AssetLib |
| Data format | Dictionary/struct | Object | TMap/UStruct | Dictionary |
| Callbacks | C# delegates | EventEmitter | Dynamic delegates | Signals |
| Storage | PlayerPrefs | localStorage | SaveGame | ConfigFile |

### Package structure in monorepo

```
packages/
├── sdk-core/              # Protocol logic, shared types
│   ├── src/
│   │   ├── session.ts
│   │   ├── events.ts
│   │   ├── replay.ts
│   │   ├── websocket.ts
│   │   ├── integrity.ts   # HMAC, hash chains, checksums
│   │   └── types.ts
│   └── package.json
│
├── sdk-web/               # Web/JS wrapper (@oghub/sdk)
│   └── src/index.ts
│
├── sdk-unity/             # Unity package (com.oghub.sdk)
│   ├── Runtime/
│   │   ├── OGHub.cs
│   │   ├── OGHubWebSocket.cs
│   │   └── OGHubStorage.cs
│   └── package.json
│
├── sdk-unreal/            # Unreal plugin
│   ├── Source/OGHubSDK/
│   └── OGHubSDK.uplugin
│
└── sdk-godot/             # Godot addon
    ├── addons/oghub/
    └── plugin.cfg
```

## Trust Tiers

Three trust levels that unlock progressively higher prize pools:

### Basic (zero effort from developer)
- **Prize pool limit:** up to $50
- **Requirements:** SDK init only
- **Validation:**
  - Input rate validation (from `anticheat.max_input_rate`)
  - Score bounds check (`scoring.range`)
  - Behavioral fingerprinting (reaction times, robotic patterns)
  - Session rate limiting (30/hour, 5s cooldown)
  - Statistical z-score anomaly detection

### Standard (adds live validation)
- **Prize pool limit:** up to $1,000
- **Requirements:** WebSocket connection + snapshot validation callback
- **Validation:** Everything in Basic, plus:
  - Server-initiated state snapshots every `validation.snapshot_interval`
  - Score hash chain verification
  - Cross-session behavioral analysis
  - Silent flag on anomaly (player continues, score rejected at end)

### Verified (adds replay simulation)
- **Prize pool limit:** unlimited
- **Requirements:** Replay simulator provided (WASM or Docker)
- **Validation:** Everything in Standard, plus:
  - Full replay re-simulation from recorded inputs
  - Deterministic score match verification
  - Simulator runs in sandboxed environment

## Generic Fraud Engine

Replaces the current NeonRunner-specific fraud engine. Loads rules dynamically from Game Definition:

### Layer 1: Universal (always runs)
- Score within `scoring.range`
- Session duration between `session.min_duration` and `session.max_duration`
- Replay hash integrity (SHA-256)
- Session rate limiting

### Layer 2: Game-Configured
- Input rate ≤ `anticheat.max_input_rate`
- Reaction time ≥ `anticheat.min_reaction_time`
- Score per second ≤ `anticheat.max_score_per_second`
- Custom rules from `anticheat.custom_rules` evaluated as expressions

### Layer 3: Statistical (per user)
- Z-score vs user history (flag > 4σ)
- Impossible improvement detection (3x previous best)
- Global outlier detection
- Cumulative fraud score with decay

### Layer 4: Live Validation (Standard+ only)
- State snapshot consistency (score vs inputs vs position)
- Score hash chain unbroken
- Cross-field correlation (health vs damage events, position vs move inputs)
- Increased check frequency on first anomaly

### Layer 5: Replay Simulation (Verified only)
- Full replay re-execution in sandbox
- Final score must match exactly
- Seed must match session seed
- Duration within acceptable range

### Fraud response: Silent Flag
When anomaly detected mid-game:
- Session flagged silently
- Player continues playing (unaware)
- Check frequency increases
- At session end: score rejected, bet cancelled
- Cheater never learns what triggered detection

## Live Validation Flow (WebSocket)

```
Game SDK                    WebSocket                   Server
  │                            │                          │
  │── reportInput(shoot) ─────►│─── input stream ────────►│
  │── updateScore(1500) ──────►│─── score + hash ────────►│
  │                            │                          │
  │                            │◄── validation_request ───│  (every N seconds)
  │◄── onValidationRequest() ──│                          │
  │── return { hp, pos, ... } ─►│─── snapshot ───────────►│
  │                            │                          │
  │                            │    [compare snapshot     │
  │                            │     against expected     │
  │                            │     state from inputs]   │
  │                            │                          │
  │                            │    [anomaly? silent flag] │
  │                            │                          │
  │── endSession() ───────────►│─── final score ─────────►│
  │◄── result: rejected ───────│◄── bet cancelled ────────│
```

## API Changes

| Endpoint | Change |
|----------|--------|
| `POST /api/games/register` | **New** - register game definition |
| `PUT /api/games/:slug/definition` | **New** - update game definition |
| `POST /api/sessions/create` | **Modified** - loads game definition, applies trust tier |
| `POST /api/sessions/:id/events` | **Modified** - validates against game's input definitions |
| `POST /api/sessions/:id/end` | **Modified** - fraud engine loads rules from game definition |
| `WS /api/sessions/:id/live` | **New** - WebSocket for live validation + leaderboard |
| `POST /api/games/:slug/simulator` | **New** - upload replay simulator (verified tier) |

## NeonRunner Migration

NeonRunner becomes the first Verified tier game on the platform:

```yaml
# oghub.game.yaml for NeonRunner
name: "Neon Runner"
slug: "neon-runner"
version: "1.0.0"
engine: unity

inputs:
  - name: lane_left
    type: action
  - name: lane_right
    type: action
  - name: jump
    type: action
  - name: slide
    type: action

scoring:
  range: [0, 999999999]
  method: accumulative
  components:
    - name: distance
      weight: 1
    - name: near_miss
      weight: 100
    - name: perfect_dodge
      weight: 200
    - name: skill_gate
      weight: 500

session:
  max_duration: 600s
  min_duration: 5s
  allow_pause: false

anticheat:
  max_input_rate: 10/s
  min_reaction_time: 80ms
  max_score_per_second: 2000

trust:
  tier: verified
  replay_simulator: native

validation:
  snapshot_interval: 3s
  required_fields:
    - current_score
    - current_lane
    - player_alive
    - current_tick
```

The current `OGHubBridge.cs` (~400 lines) is replaced by the generic `sdk-unity` wrapper — ~6 lines of integration code.

## Security Model Summary

| Layer | What | Where |
|-------|------|-------|
| HMAC-SHA256 request signing | Every API call signed with nonce + timestamp | SDK (transparent) |
| Nonce replay protection | Each nonce used once (5min TTL in Redis) | Server |
| Score hash chain | Every score update creates cryptographic chain | SDK + Server |
| State snapshots | Server-initiated validation checks | WebSocket |
| Silent flag | Anomalous sessions flagged without player knowledge | Server |
| Replay re-simulation | Full game replay from inputs (Verified tier) | Server sandbox |
| Rate limiting | 50 req/s per API key, 30 sessions/hour per user | Server |
| SDK version enforcement | Minimum version required | Server |
| Platform attestation | Optional Android Play Integrity / iOS App Attest | SDK + Server |
