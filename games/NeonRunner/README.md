# Neon Runner — Deterministic Unity Architecture

A competitive, skill-based 3D endless runner designed for the OGHUB platform.

## Architecture Principles
To guarantee fair competition and validatable replays, this project strictly separates **Simulation** (headless, math-only) from **Rendering** (Unity objects).

- **NO Unity Physics:** We do not use `Rigidbody`, `PhysX`, or `OnTriggerEnter`. All collision uses custom AABB fixed-point math (`FixedMath.cs`).
- **NO Floating Point Drift:** All positional and speed calculations use Q16.16 Fixed Point Structs (`Fixed.cs`). 
- **Tick-Based Evolution:** The `SimulationManager` updates at a locked 60 ticks/sec, utterly decoupled from Unity's `Time.deltaTime`.
- **Deterministic RNG:** Procedural generation uses `Xoshiro256**`, meaning identical seed = identical obstacle layout.

## Features Included
1. **RunnerSimulation:** Manages lanes, jump arcs, and slide shrink.
2. **ObstacleSpawner:** Procedurally schedules obstacles, skill gates, and risk tunnels based on active difficulty phase limits.
3. **GhostManager:** Re-simulates other players' inputs alongside live gameplay using synchronized ticks.
4. **ReplaySystem:** Captures inputs, hashes with SHA-256 for server validation.
5. **OGHubBridge:** Boilerplate SDK interface to OGHUB.gg (`InitializeGame`, `StartSession`, `EndSession`, `ReportEvent`).

## Native Build Instructions (iOS & Android)

Neon Runner is built to be **100% Native cross-platform**. The core C# simulation translates natively via Unity's IL2CPP compiler directly to C++ for both iOS (ARM64) and Android.

### iOS (Native IPA)
1. Open Unity Engine (versions 2022.3 LTS or 2023.x recommended).
2. Open Project: `OGHUB.gg/games/NeonRunner`.
3. Go to **File -> Build Settings**.
4. Switch Platform to **iOS**.
5. Enable **IL2CPP** in Player Settings (default for iOS).
6. Click **Build**. Unity will generate an Xcode project.
7. Open the generated project in Xcode on a Mac, set your Apple Developer Team, and click **Auto Sign**.
8. Build & Run to deploy directly to your iPhone or export as an `.ipa`.

### Android (Native APK / AAB)
1. In **File -> Build Settings**, switch Platform to **Android**.
2. Enable **IL2CPP** and check **ARM64** in Player Settings.
3. Open **Player Settings -> Resolution and Presentation**, set Default Orientation to **Portrait**.
4. Click **Build** to output a `NeonRunner.apk` or `.aab` for Google Play.

> Note: To test determinism headless, you can instantiate `SimulationManager` in a standard C# environment outside of Unity!
