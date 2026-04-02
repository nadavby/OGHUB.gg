using System.Collections.Generic;
using UnityEngine;
using NeonRunner.Core;
using NeonRunner.SDK;

namespace NeonRunner.Game
{
    /// <summary>
    /// Connects Unity's lifecycle to the pure deterministic simulation.
    /// Handles fixed timesteps, routing input, and triggering rendering.
    /// </summary>
    public sealed class GameManager : MonoBehaviour
    {
        public static GameManager Instance { get; private set; }

        [Header("References")]
        [SerializeField] private RunnerRenderer _runnerRenderer;
        
        // Systems
        private SimulationManager _simulation;
        private TickInputManager _inputManager;
        private GhostManager _ghostManager;
        
        // Loop State
        private float _accumulator;
        private const float TICK_TIME = 1f / SimulationManager.TICKS_PER_SECOND;

        private void Awake()
        {
            Instance = this;
            _inputManager = new TickInputManager();
            _ghostManager = new GhostManager();
        }

        private async void Start()
        {
            // For standalone testing, initialize directly:
            if (!OGHubBridge.Instance.IsInitialized)
            {
                OGHubBridge.Instance.InitializeGame(123456789, "demo-challenge", "test-token");
            }

            // Start Session
            await OGHubBridge.Instance.StartSession();
            
            _simulation = new SimulationManager(OGHubBridge.Instance.CurrentConfig);
        }

        private void Update()
        {
            if (_simulation == null || _simulation.IsGameOver) return;

            // 1. Gather Input (Happens in Update for minimum latency)
            GatherInput();

            // 2. Fixed Timestep Accumulator Loop
            _accumulator += Time.deltaTime;
            while (_accumulator >= TICK_TIME)
            {
                _accumulator -= TICK_TIME;
                
                // Commit the captured input to the current tick
                _inputManager.CommitTick(_simulation.CurrentTick);
                
                InputAction action = _inputManager.GetActionForTick(_simulation.CurrentTick);
                
                // Advance live simulation
                _simulation.Tick(action);
                
                // Advance ghost simulations synchronously
                _ghostManager.Tick();
                
                // Check if game over happened during this tick
                if (_simulation.IsGameOver)
                {
                    HandleGameOver();
                    break;
                }
            }

            // 3. Render (Visual interpolation)
            if (!_simulation.IsGameOver)
            {
                // Interpolation factor between ticks for smooth visual rendering
                float alpha = _accumulator / TICK_TIME;
                _runnerRenderer.UpdateVisuals(_simulation.GetSnapshot().Runner, alpha);
                
                // Note: UIManager and EnvironmentGenerator would be updated here too.
            }
        }

        private void GatherInput()
        {
            // Keyboard test fallback; on mobile this would be swipes
            if (Input.GetKeyDown(KeyCode.A) || Input.GetKeyDown(KeyCode.LeftArrow))
                _inputManager.RegisterInput(InputAction.LaneLeft);
            else if (Input.GetKeyDown(KeyCode.D) || Input.GetKeyDown(KeyCode.RightArrow))
                _inputManager.RegisterInput(InputAction.LaneRight);
            else if (Input.GetKeyDown(KeyCode.W) || Input.GetKeyDown(KeyCode.UpArrow))
                _inputManager.RegisterInput(InputAction.Jump);
            else if (Input.GetKeyDown(KeyCode.S) || Input.GetKeyDown(KeyCode.DownArrow))
                _inputManager.RegisterInput(InputAction.Slide);
        }

        private async void HandleGameOver()
        {
            Debug.Log($"[GameManager] Game Over! Score: {_simulation.GetSnapshot().Score}");

            var replay = ReplaySystem.CreateReplay(
                _simulation.GetSnapshot(), 
                OGHubBridge.Instance.CurrentConfig, 
                _inputManager.RecordedInputs
            );

            // Report final score and hash to backend
            await OGHubBridge.Instance.EndSession(replay);
            
            // Show UI
            // UIManager.Instance.ShowPostRunScreen(replay);
        }

        public SimulationSnapshot GetCurrentSnapshot() => _simulation.GetSnapshot();
        public IReadOnlyList<ObstacleData> GetActiveObstacles() => _simulation.GetObstacles();
    }
}
