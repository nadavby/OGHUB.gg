using System.Collections.Generic;

namespace NeonRunner.Core
{
    /// <summary>
    /// Seed-based procedural obstacle generation.
    /// Consumes RNG in deterministic order.
    /// No Unity APIs — pure logic.
    /// </summary>
    public sealed class ObstacleSpawner
    {
        // ─── Configuration ──────────────────────────────────────

        private static readonly Fixed LANE_WIDTH = Fixed.FromFloat(2.0f);
        private static readonly Fixed SPAWN_Z_AHEAD = Fixed.FromFloat(60.0f);
        private static readonly Fixed DESPAWN_Z_BEHIND = Fixed.FromFloat(-5.0f);

        // Obstacle dimensions (half-extents)
        private static readonly FixedVec3 LOW_BARRIER_SIZE = new FixedVec3(
            Fixed.FromFloat(0.8f), Fixed.FromFloat(0.5f), Fixed.FromFloat(0.3f));
        private static readonly FixedVec3 HIGH_BARRIER_SIZE = new FixedVec3(
            Fixed.FromFloat(0.8f), Fixed.FromFloat(1.5f), Fixed.FromFloat(0.3f));
        private static readonly FixedVec3 FULL_BLOCK_SIZE = new FixedVec3(
            Fixed.FromFloat(0.8f), Fixed.FromFloat(1.0f), Fixed.FromFloat(0.3f));
        private static readonly FixedVec3 SKILL_GATE_SIZE = new FixedVec3(
            Fixed.FromFloat(0.4f), Fixed.FromFloat(1.8f), Fixed.FromFloat(0.2f));

        // ─── State ──────────────────────────────────────────────

        private readonly DeterministicRNG _rng;
        private readonly DifficultyManager _difficulty;
        private readonly List<ObstacleData> _obstacles = new List<ObstacleData>(128);
        private int _nextId;
        private int _lastSpawnTick;
        private int _ticksUntilNextSpawn;

        public IReadOnlyList<ObstacleData> Obstacles => _obstacles;

        public ObstacleSpawner(DeterministicRNG rng, DifficultyManager difficulty)
        {
            _rng = rng;
            _difficulty = difficulty;
            _nextId = 0;
            _lastSpawnTick = 0;
            _ticksUntilNextSpawn = 60; // 1 second initial delay
        }

        // ─── Tick Update ────────────────────────────────────────

        /// <summary>
        /// Advance spawner by one tick.
        /// Returns list of newly spawned obstacles (if any).
        /// </summary>
        public void Tick(int currentTick, Fixed runnerZ)
        {
            _ticksUntilNextSpawn--;

            if (_ticksUntilNextSpawn <= 0)
            {
                SpawnGroup(currentTick, runnerZ);
                _ticksUntilNextSpawn = _difficulty.GetSpawnInterval(currentTick);
                _lastSpawnTick = currentTick;
            }

            // Despawn obstacles behind runner
            DespawnBehind(runnerZ);
        }

        // ─── Spawning ───────────────────────────────────────────

        private void SpawnGroup(int tick, Fixed runnerZ)
        {
            int complexity = _difficulty.GetComplexity(tick);

            // Determine pattern based on complexity
            int patternRoll = _rng.Next(100);

            if (complexity >= 70 && patternRoll < 10)
            {
                // Risk Tunnel: 3 obstacles in quick succession
                SpawnRiskTunnel(tick, runnerZ);
            }
            else if (complexity >= 50 && patternRoll < 20)
            {
                // Skill Gate: tight gap between two obstacles
                SpawnSkillGate(tick, runnerZ);
            }
            else if (complexity >= 30 && patternRoll < 40)
            {
                // Multi-lane: two lanes blocked
                SpawnMultiLane(tick, runnerZ);
            }
            else
            {
                // Single obstacle
                SpawnSingle(tick, runnerZ);
            }
        }

        private void SpawnSingle(int tick, Fixed runnerZ)
        {
            Lane lane = (Lane)_rng.Next(3);
            ObstacleType type = PickObstacleType(tick);

            SpawnObstacle(tick, type, lane, runnerZ + SPAWN_Z_AHEAD);
        }

        private void SpawnMultiLane(int tick, Fixed runnerZ)
        {
            // Block 2 of 3 lanes — player must be in the remaining one
            int openLane = _rng.Next(3);
            ObstacleType type = PickObstacleType(tick);

            Fixed spawnZ = runnerZ + SPAWN_Z_AHEAD;

            for (int i = 0; i < 3; i++)
            {
                if (i != openLane)
                {
                    SpawnObstacle(tick, type, (Lane)i, spawnZ);
                }
            }
        }

        private void SpawnSkillGate(int tick, Fixed runnerZ)
        {
            // Two tall obstacles in adjacent lanes with a narrow gap
            int gateLane = _rng.Next(3);
            Fixed spawnZ = runnerZ + SPAWN_Z_AHEAD;

            for (int i = 0; i < 3; i++)
            {
                if (i != gateLane)
                {
                    var obs = CreateObstacle(tick, ObstacleType.SkillGate, (Lane)i, spawnZ);
                    obs.NearMissBonus = 500; // High reward
                    _obstacles.Add(obs);
                }
            }
        }

        private void SpawnRiskTunnel(int tick, Fixed runnerZ)
        {
            // 3–5 obstacles in sequence, tight timing
            int count = 3 + _rng.Next(3);
            Fixed baseZ = runnerZ + SPAWN_Z_AHEAD;
            Fixed spacing = Fixed.FromFloat(3.0f);

            int safeLane = _rng.Next(3);

            for (int i = 0; i < count; i++)
            {
                Fixed z = baseZ + spacing * Fixed.FromInt(i);

                // Vary which lanes are blocked, but always leave safe lane open
                for (int lane = 0; lane < 3; lane++)
                {
                    if (lane != safeLane)
                    {
                        bool spawn = _rng.NextBool(Fixed.FromFloat(0.7f));
                        if (spawn)
                        {
                            var obs = CreateObstacle(tick, ObstacleType.RiskTunnel, (Lane)lane, z);
                            obs.NearMissBonus = 150;
                            _obstacles.Add(obs);
                        }
                    }
                }

                // Rotate safe lane occasionally for extra difficulty
                if (_rng.NextBool(Fixed.FromFloat(0.3f)))
                {
                    safeLane = _rng.Next(3);
                }
            }
        }

        // ─── Helpers ────────────────────────────────────────────

        private ObstacleType PickObstacleType(int tick)
        {
            int complexity = _difficulty.GetComplexity(tick);
            int roll = _rng.Next(100);

            if (complexity < 20)
            {
                // Simple: just full blocks (lane change required)
                return ObstacleType.FullBlock;
            }
            else if (complexity < 50)
            {
                // Mix of types
                if (roll < 33) return ObstacleType.LowBarrier;
                if (roll < 66) return ObstacleType.HighBarrier;
                return ObstacleType.FullBlock;
            }
            else
            {
                // All types + harder distribution
                if (roll < 20) return ObstacleType.LowBarrier;
                if (roll < 40) return ObstacleType.HighBarrier;
                if (roll < 70) return ObstacleType.FullBlock;
                if (roll < 85) return ObstacleType.SkillGate;
                return ObstacleType.RiskTunnel;
            }
        }

        private void SpawnObstacle(int tick, ObstacleType type, Lane lane, Fixed z)
        {
            var obs = CreateObstacle(tick, type, lane, z);
            _obstacles.Add(obs);
        }

        private ObstacleData CreateObstacle(int tick, ObstacleType type, Lane lane, Fixed z)
        {
            Fixed laneX = GetLaneX(lane);
            FixedVec3 halfExtents = GetHalfExtents(type);

            // Y position: ground for full blocks, elevated for high barriers
            Fixed y = halfExtents.Y;
            if (type == ObstacleType.HighBarrier)
            {
                y = Fixed.FromFloat(1.5f); // Mid-height, must slide under
            }

            return new ObstacleData
            {
                Id = _nextId++,
                Type = type,
                Lane = lane,
                Position = new FixedVec3(laneX, y, z),
                HalfExtents = halfExtents,
                IsActive = true,
                SpawnTick = tick,
                NearMissBonus = type == ObstacleType.SkillGate ? 500 : 100,
            };
        }

        private FixedVec3 GetHalfExtents(ObstacleType type)
        {
            switch (type)
            {
                case ObstacleType.LowBarrier: return LOW_BARRIER_SIZE;
                case ObstacleType.HighBarrier: return HIGH_BARRIER_SIZE;
                case ObstacleType.SkillGate: return SKILL_GATE_SIZE;
                case ObstacleType.RiskTunnel: return FULL_BLOCK_SIZE;
                default: return FULL_BLOCK_SIZE;
            }
        }

        public static Fixed GetLaneX(Lane lane)
        {
            switch (lane)
            {
                case Lane.Left: return -LANE_WIDTH;
                case Lane.Right: return LANE_WIDTH;
                default: return Fixed.Zero; // Center
            }
        }

        private void DespawnBehind(Fixed runnerZ)
        {
            Fixed cutoff = runnerZ + DESPAWN_Z_BEHIND;
            for (int i = _obstacles.Count - 1; i >= 0; i--)
            {
                if (_obstacles[i].Position.Z < cutoff)
                {
                    // Swap-remove for performance
                    _obstacles[i] = _obstacles[_obstacles.Count - 1];
                    _obstacles.RemoveAt(_obstacles.Count - 1);
                }
            }
        }

        public void Reset()
        {
            _obstacles.Clear();
            _nextId = 0;
            _lastSpawnTick = 0;
            _ticksUntilNextSpawn = 60;
        }
    }
}
