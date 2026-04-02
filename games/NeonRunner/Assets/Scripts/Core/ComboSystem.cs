using System;

namespace NeonRunner.Core
{
    /// <summary>
    /// Exponential combo system that rewards consecutive skill actions.
    /// Resets on collisions or long periods without skill actions.
    /// Pure deterministic math.
    /// </summary>
    public sealed class ComboSystem
    {
        private const int COMBO_TIMEOUT_TICKS = 180; // 3 seconds at 60 ticks/sec
        private static readonly Fixed MAX_MULTIPLIER = Fixed.FromInt(20);

        private int _comboCount;
        private int _ticksSinceLastAction;
        private int _maxCombo;

        public int ComboCount => _comboCount;
        public int MaxCombo => _maxCombo;

        public ComboSystem()
        {
            Reset();
        }

        public void Tick()
        {
            if (_comboCount > 0)
            {
                _ticksSinceLastAction++;
                if (_ticksSinceLastAction >= COMBO_TIMEOUT_TICKS)
                {
                    ResetCombo();
                }
            }
        }

        public void RegisterSkillAction()
        {
            _comboCount++;
            _ticksSinceLastAction = 0;
            if (_comboCount > _maxCombo)
            {
                _maxCombo = _comboCount;
            }
        }

        public void ResetCombo()
        {
            _comboCount = 0;
            _ticksSinceLastAction = 0;
        }

        /// <summary>
        /// Exponential multiplier: 1.0 + 0.5 * (comboCount^1.3)
        /// Capped at MAX_MULTIPLIER.
        /// </summary>
        public Fixed GetMultiplier()
        {
            if (_comboCount == 0) return Fixed.One;

            // Approximate pow(combo, 1.3)
            // Using integer math to remain deterministic:
            // x^1.3 ~ x * x^0.3
            // We'll use a simpler deterministic curve: linear + quadratic term
            // multiplier = 1.0 + 0.1 * combo + 0.05 * combo^2
            
            Fixed comboFixed = Fixed.FromInt(_comboCount);
            Fixed linearTerm = Fixed.FromFloat(0.1f) * comboFixed;
            Fixed quadTerm = Fixed.FromFloat(0.05f) * comboFixed * comboFixed;

            Fixed rawMultiplier = Fixed.One + linearTerm + quadTerm;

            return Fixed.Min(rawMultiplier, MAX_MULTIPLIER);
        }

        public void Reset()
        {
            _comboCount = 0;
            _ticksSinceLastAction = 0;
            _maxCombo = 0;
        }
    }
}
