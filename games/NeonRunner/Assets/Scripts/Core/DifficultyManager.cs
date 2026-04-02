namespace NeonRunner.Core
{
    /// <summary>
    /// Controls difficulty progression over time.
    /// All outputs are deterministic — no Unity APIs.
    /// </summary>
    public sealed class DifficultyManager
    {
        // ─── Constants ──────────────────────────────────────────

        // Phase boundaries (in ticks at 60 ticks/sec)
        private const int ONBOARDING_END = 30 * 60;     // 30 seconds
        private const int SKILLZONE_END = 90 * 60;      // 90 seconds
        private const int ESCALATION_END = 180 * 60;    // 180 seconds

        // Speed (units per tick)
        private static readonly Fixed BASE_SPEED = Fixed.FromFloat(0.15f);
        private static readonly Fixed MAX_SPEED = Fixed.FromFloat(0.55f);

        // Obstacle density (spawn interval in ticks)
        private const int BASE_SPAWN_INTERVAL = 90;   // 1.5 seconds
        private const int MIN_SPAWN_INTERVAL = 20;    // 0.33 seconds

        // Pattern complexity (0–100)
        private const int BASE_COMPLEXITY = 10;
        private const int MAX_COMPLEXITY = 100;

        private readonly GameModifiers _modifiers;

        public DifficultyManager(GameModifiers modifiers)
        {
            _modifiers = modifiers;
        }

        // ─── Phase ──────────────────────────────────────────────

        public GamePhase GetPhase(int tick)
        {
            if (tick < ONBOARDING_END) return GamePhase.Onboarding;
            if (tick < SKILLZONE_END) return GamePhase.SkillZone;
            if (tick < ESCALATION_END) return GamePhase.Escalation;
            return GamePhase.Endgame;
        }

        // ─── Speed ──────────────────────────────────────────────

        /// <summary>
        /// Returns runner speed at given tick.
        /// Logarithmic curve: fast early increase, soft cap at high durations.
        /// </summary>
        public Fixed GetSpeed(int tick)
        {
            // Base curve: speed = BASE + (MAX - BASE) * (1 - 1/(1 + t/3600))
            // This gives ~50% speed increase by 60s, ~75% by 180s
            Fixed t = Fixed.FromInt(tick);
            Fixed divisor = Fixed.One + t / Fixed.FromInt(3600);
            Fixed progress = Fixed.One - Fixed.One / divisor;
            Fixed speed = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * progress;

            // Apply modifiers
            if ((_modifiers & GameModifiers.SpeedX20) != 0)
                speed = speed * Fixed.Two;
            else if ((_modifiers & GameModifiers.SpeedX15) != 0)
                speed = speed * Fixed.FromFloat(1.5f);
            else if ((_modifiers & GameModifiers.SpeedX12) != 0)
                speed = speed * Fixed.FromFloat(1.2f);

            return speed;
        }

        // ─── Obstacle Density ───────────────────────────────────

        /// <summary>
        /// Returns spawn interval in ticks.
        /// Lower = more dense.
        /// </summary>
        public int GetSpawnInterval(int tick)
        {
            GamePhase phase = GetPhase(tick);

            int interval;
            switch (phase)
            {
                case GamePhase.Onboarding:
                    // Gentle: 90 → 70 ticks over 30s
                    interval = BASE_SPAWN_INTERVAL - (tick * 20 / ONBOARDING_END);
                    break;

                case GamePhase.SkillZone:
                    // Moderate: 70 → 45 ticks
                    int progressTicks = tick - ONBOARDING_END;
                    int phaseDuration = SKILLZONE_END - ONBOARDING_END;
                    interval = 70 - (progressTicks * 25 / phaseDuration);
                    break;

                case GamePhase.Escalation:
                    // Aggressive: 45 → 25 ticks
                    progressTicks = tick - SKILLZONE_END;
                    phaseDuration = ESCALATION_END - SKILLZONE_END;
                    interval = 45 - (progressTicks * 20 / phaseDuration);
                    break;

                default: // Endgame
                    // Soft cap: approach MIN_SPAWN_INTERVAL asymptotically
                    progressTicks = tick - ESCALATION_END;
                    interval = MIN_SPAWN_INTERVAL + 5000 / (progressTicks + 200);
                    break;
            }

            return System.Math.Max(interval, MIN_SPAWN_INTERVAL);
        }

        // ─── Pattern Complexity ─────────────────────────────────

        /// <summary>
        /// Returns complexity value 0–100.
        /// Higher = more multi-lane obstacles, skill gates, risk tunnels.
        /// </summary>
        public int GetComplexity(int tick)
        {
            GamePhase phase = GetPhase(tick);

            switch (phase)
            {
                case GamePhase.Onboarding:
                    return BASE_COMPLEXITY + (tick * 10 / ONBOARDING_END);

                case GamePhase.SkillZone:
                    return 20 + ((tick - ONBOARDING_END) * 30 / (SKILLZONE_END - ONBOARDING_END));

                case GamePhase.Escalation:
                    return 50 + ((tick - SKILLZONE_END) * 30 / (ESCALATION_END - SKILLZONE_END));

                default:
                    return System.Math.Min(MAX_COMPLEXITY, 80 + (tick - ESCALATION_END) / 300);
            }
        }

        // ─── Near-Miss Window ───────────────────────────────────

        /// <summary>
        /// Distance threshold for near-miss detection.
        /// Tighter in later phases for skill reward.
        /// </summary>
        public Fixed GetNearMissThreshold(int tick)
        {
            GamePhase phase = GetPhase(tick);

            switch (phase)
            {
                case GamePhase.Onboarding:
                    return Fixed.FromFloat(0.8f);  // Generous
                case GamePhase.SkillZone:
                    return Fixed.FromFloat(0.6f);
                case GamePhase.Escalation:
                    return Fixed.FromFloat(0.45f);
                default:
                    return Fixed.FromFloat(0.35f); // Tight
            }
        }
    }
}
