using System;

namespace NeonRunner.Core
{
    /// <summary>
    /// Deterministic scoring system.
    /// Distances scores diminish over time so skill scores dominate.
    /// </summary>
    public sealed class ScoreSystem
    {
        // ─── Constants ──────────────────────────────────────────

        private static readonly Fixed DISTANCE_DECAY = Fixed.FromFloat(0.01f);
        private const int SCORE_NEAR_MISS = 100;
        private const int SCORE_PERFECT_DODGE = 200;
        private const int SCORE_SKILL_GATE_BASE = 500;

        // ─── State ──────────────────────────────────────────────

        private Fixed _scoreBuffer; // Accumulates fractional score from distance
        private int _totalScore;

        private int _nearMisses;
        private int _perfectDodges;
        private int _skillGatesPassed;

        public int TotalScore => _totalScore;
        public int NearMisses => _nearMisses;
        public int PerfectDodges => _perfectDodges;
        public int SkillGatesPassed => _skillGatesPassed;

        public ScoreSystem()
        {
            Reset();
        }

        // ─── Distance Scoring ───────────────────────────────────

        /// <summary>
        /// Adds score based on distance traveled in the current tick.
        /// Benefit diminishes over time to prevent non-skill grinding.
        /// </summary>
        public void AddDistanceScore(Fixed speed, int currentTick)
        {
            // Diminishing factor: 1.0 / (1.0 + time * 0.01)
            Fixed timeInSeconds = Fixed.FromInt(currentTick) / Fixed.FromInt(60);
            Fixed divisor = Fixed.One + timeInSeconds * DISTANCE_DECAY;
            Fixed distancePoints = speed / divisor;

            _scoreBuffer += distancePoints * Fixed.FromFloat(10.0f); // Scale factor

            // Flush integer part
            int flush = _scoreBuffer.ToInt();
            if (flush > 0)
            {
                _totalScore += flush;
                _scoreBuffer -= Fixed.FromInt(flush);
            }
        }

        // ─── Skill Scoring ──────────────────────────────────────

        public void AddNearMiss(Fixed comboMultiplier, int obstacleBonus)
        {
            _nearMisses++;
            int points = (int)((SCORE_NEAR_MISS + obstacleBonus) * comboMultiplier.ToFloat());
            _totalScore += points;
        }

        public void AddPerfectDodge(Fixed comboMultiplier)
        {
            _perfectDodges++;
            int points = (int)(SCORE_PERFECT_DODGE * comboMultiplier.ToFloat());
            _totalScore += points;
        }

        public void AddSkillGate(Fixed comboMultiplier)
        {
            _skillGatesPassed++;
            int points = (int)(SCORE_SKILL_GATE_BASE * comboMultiplier.ToFloat());
            _totalScore += points;
        }

        // ─── Utility ────────────────────────────────────────────

        public void Reset()
        {
            _scoreBuffer = Fixed.Zero;
            _totalScore = 0;
            _nearMisses = 0;
            _perfectDodges = 0;
            _skillGatesPassed = 0;
        }
    }
}
