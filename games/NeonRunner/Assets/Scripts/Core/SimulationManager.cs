using System.Collections.Generic;

namespace NeonRunner.Core
{
    /// <summary>
    /// The core simulation loop. Decoupled from Unity's MonoBehaviour.
    /// Runs tick-by-tick deterministically.
    /// </summary>
    public sealed class SimulationManager
    {
        public const int TICKS_PER_SECOND = 60;
        public static readonly Fixed TICK_DELTA = Fixed.One / Fixed.FromInt(TICKS_PER_SECOND);

        private readonly DeterministicRNG _rng;
        private readonly DifficultyManager _difficulty;
        private readonly RunnerSimulation _runner;
        private readonly ObstacleSpawner _spawner;
        private readonly ScoreSystem _score;
        private readonly ComboSystem _combo;

        private int _currentTick;
        private bool _isGameOver;

        public SimulationManager(GameConfig config)
        {
            _rng = new DeterministicRNG(config.Seed);
            _difficulty = new DifficultyManager(config.Modifiers);
            
            // Fork RNG for spawner so runner and other systems can use their own streams if needed
            _spawner = new ObstacleSpawner(_rng.Fork(), _difficulty);
            
            _runner = new RunnerSimulation(_difficulty, config.StartingLives);
            _score = new ScoreSystem();
            _combo = new ComboSystem();
            
            _currentTick = 0;
            _isGameOver = false;
        }

        /// <summary>
        /// Advance simulation by one tick given the input for this tick.
        /// </summary>
        public void Tick(InputAction inputAction)
        {
            if (_isGameOver) return;

            // 1. Process Input
            _runner.ProcessInput(inputAction);

            // 2. Combo System tick (timeout logic)
            _combo.Tick();

            // 3. Runner Movement & Collision
            NearMissResult nearMiss = _runner.Tick(_spawner);

            // 4. Update Spawner
            _spawner.Tick(_currentTick, _runner.State.Position.Z);

            // 5. Check GameOver condition
            if (!_runner.State.IsAlive)
            {
                _isGameOver = true;
                _combo.ResetCombo();
                return;
            }

            // 6. Handle Near-Miss & Scoring
            _score.AddDistanceScore(_runner.State.Speed, _currentTick);

            if (nearMiss.Occurred)
            {
                _combo.RegisterSkillAction();
                Fixed mult = _combo.GetMultiplier();

                if (nearMiss.IsPerfectDodge)
                {
                    _score.AddPerfectDodge(mult);
                }
                else
                {
                    // If it was a SkillGate, give gate bonus, else near miss bonus
                    _score.AddNearMiss(mult, 0); // TODO: pass obstacle nearMissBonus if fetched
                }
            }

            _currentTick++;
        }

        public SimulationSnapshot GetSnapshot()
        {
            return new SimulationSnapshot
            {
                Runner = _runner.State,
                Score = _score.TotalScore,
                ComboCount = _combo.ComboCount,
                ComboMultiplier = _combo.GetMultiplier(),
                Phase = _difficulty.GetPhase(_currentTick),
                TimeElapsed = Fixed.FromInt(_currentTick) * TICK_DELTA,
                NearMisses = _score.NearMisses,
                PerfectDodges = _score.PerfectDodges,
                MaxCombo = _combo.MaxCombo,
                SkillGatesPassed = _score.SkillGatesPassed
            };
        }

        public IReadOnlyList<ObstacleData> GetObstacles() => _spawner.Obstacles;
        
        public bool IsGameOver => _isGameOver;
        public int CurrentTick => _currentTick;
    }
}
