using System.Collections.Generic;

namespace NeonRunner.Core
{
    /// <summary>
    /// Manages the playback of ghosts concurrently with the live game.
    /// Simulates a ghost's run tick-by-tick based on its ReplayData.
    /// Pure logic — rendering is handled externally.
    /// </summary>
    public sealed class GhostManager
    {
        private class GhostInstance
        {
            public ReplayData Replay;
            public SimulationManager Sim;
            public int CurrentInputIndex;
            public bool IsFinished;
            public string PlayerName;
        }

        private readonly List<GhostInstance> _ghosts = new List<GhostInstance>();
        private int _currentTick;

        /// <summary>
        /// Adds a ghost to be played back alongside the main simulation.
        /// </summary>
        public void AddGhost(ReplayData replay, string playerName)
        {
            var config = new GameConfig
            {
                Seed = replay.Seed,
                Modifiers = replay.Modifiers,
                StartingLives = replay.StartingLives
            };

            _ghosts.Add(new GhostInstance
            {
                Replay = replay,
                Sim = new SimulationManager(config),
                CurrentInputIndex = 0,
                IsFinished = false,
                PlayerName = playerName
            });
        }

        /// <summary>
        /// Advances all ghost simulations by one tick.
        /// Should be called synchronously with the main SimulationManager's Tick.
        /// </summary>
        public void Tick()
        {
            foreach (var ghost in _ghosts)
            {
                if (ghost.IsFinished) continue;

                // Stop ghost if it reached its final tick or died
                if (_currentTick >= ghost.Replay.FinalTick || ghost.Sim.IsGameOver)
                {
                    ghost.IsFinished = true;
                    continue;
                }

                InputAction action = InputAction.None;
                
                // Get input for this tick if any
                var inputs = ghost.Replay.Inputs;
                if (ghost.CurrentInputIndex < inputs.Count && 
                    inputs[ghost.CurrentInputIndex].Tick == _currentTick)
                {
                    action = inputs[ghost.CurrentInputIndex].Action;
                    ghost.CurrentInputIndex++;
                }

                // Advance ghost simulation
                ghost.Sim.Tick(action);
            }

            _currentTick++;
        }

        /// <summary>
        /// Gets the current state snapshots for all active and finished ghosts.
        /// </summary>
        public IEnumerable<(string PlayerName, SimulationSnapshot Snapshot, bool IsFinished)> GetGhostSnapshots()
        {
            foreach (var ghost in _ghosts)
            {
                yield return (ghost.PlayerName, ghost.Sim.GetSnapshot(), ghost.IsFinished);
            }
        }

        public void Clear()
        {
            _ghosts.Clear();
            _currentTick = 0;
        }
    }
}
