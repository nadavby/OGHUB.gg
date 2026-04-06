using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;

namespace NeonRunner.Core
{
    [Serializable]
    public class ReplayData
    {
        public long Seed;
        public GameModifiers Modifiers;
        public int StartingLives;
        public List<TickInput> Inputs = new List<TickInput>();
        public int FinalScore;
        public int FinalTick;
        public string Hash;
    }

    /// <summary>
    /// Handles recording, playback, and anti-cheat validation.
    /// </summary>
    public static class ReplaySystem
    {
        /// <summary>
        /// Generates a replay object and a deterministic SHA-256 hash covering the seed and all inputs.
        /// The hash is used on the server side to verify the replay wasn't tampered with.
        /// </summary>
        public static ReplayData CreateReplay(SimulationSnapshot endSnapshot, GameConfig config, IReadOnlyList<TickInput> inputs)
        {
            var replay = new ReplayData
            {
                Seed = config.Seed,
                Modifiers = config.Modifiers,
                StartingLives = config.StartingLives,
                Inputs = new List<TickInput>(inputs),
                FinalScore = endSnapshot.Score,
                FinalTick = endSnapshot.Runner.CurrentTick
            };

            replay.Hash = GenerateHash(replay);
            return replay;
        }

        public static string GenerateHash(ReplayData replay)
        {
            var sb = new StringBuilder();
            sb.Append(replay.Seed);
            sb.Append(':').Append((ushort)replay.Modifiers);
            sb.Append(':').Append(replay.StartingLives);
            
            foreach (var input in replay.Inputs)
            {
                sb.Append('|');
                sb.Append(input.Tick);
                sb.Append(',');
                sb.Append((int)input.Action);
            }

            using (var sha256 = SHA256.Create())
            {
                byte[] bytes = Encoding.UTF8.GetBytes(sb.ToString());
                byte[] hash = sha256.ComputeHash(bytes);
                return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
            }
        }

        /// <summary>
        /// Re-simulates an entire run purely from replay data.
        /// Can be used headlessly on the server or locally for Ghost playback.
        /// </summary>
        public static SimulationSnapshot SimulateRun(ReplayData replay)
        {
            var config = new GameConfig
            {
                Seed = replay.Seed,
                Modifiers = replay.Modifiers,
                StartingLives = replay.StartingLives
            };

            var sim = new SimulationManager(config);
            
            int inputIndex = 0;

            // Run until the exact final tick
            for (int tick = 0; tick < replay.FinalTick; tick++)
            {
                InputAction action = InputAction.None;

                // Apply any inputs that happen on this tick
                if (inputIndex < replay.Inputs.Count && replay.Inputs[inputIndex].Tick == tick)
                {
                    action = replay.Inputs[inputIndex].Action;
                    inputIndex++;
                }

                sim.Tick(action);

                if (sim.IsGameOver) break;
            }

            return sim.GetSnapshot();
        }

        /// <summary>
        /// Validates that the replay produces the EXACT same score using the deterministic engine.
        /// </summary>
        public static bool ValidateReplay(ReplayData replay)
        {
            // 1. Verify Hash Integrity
            string expectedHash = GenerateHash(replay);
            if (replay.Hash != expectedHash)
                return false;

            // 2. Re-simulate the game
            var snapshot = SimulateRun(replay);

            // 3. Compare Results
            return snapshot.Score == replay.FinalScore && snapshot.Runner.CurrentTick == replay.FinalTick;
        }
    }
}
