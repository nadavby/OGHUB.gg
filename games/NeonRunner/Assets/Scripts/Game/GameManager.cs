// Assets/Scripts/Game/GameManager.cs
using System.Collections.Generic;
using UnityEngine;
using NeonRunner.Core;
using NeonRunner.Events;
using NeonRunner.Input;
using NeonRunner.Rendering;
using NeonRunner.SDK;
using NeonRunner.UI;
using NeonRunner.VFX;
using OGHub;

namespace NeonRunner.Game
{
    public enum GameMode { Practice, Competitive }

    public sealed class GameManager : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private RunnerRenderer _runnerRenderer;
        [SerializeField] private ObstacleRenderer _obstacleRenderer;
        [SerializeField] private SwipeDetector _swipeDetector;
        [SerializeField] private CountdownUI _countdownUI;
        [SerializeField] private PauseMenuUI _pauseMenuUI;

        private SimulationManager _simulation;
        private TickInputManager _inputManager;
        private GhostManager _ghostManager;

        private float _accumulator;
        private const float TICK_TIME = 1f / 60f;
        private bool _isRunning;
        private bool _isPaused;
        private bool _hasStarted;

        private GameMode _mode;
        private GameConfig _config;
        private int _lastScore;
        private int _lastComboCount;
        private int _lastLives;
        private VerticalState _lastVertical;

        private int _ghostDeltaTicks;
        private const int GHOST_DELTA_INTERVAL = 60;

        private float _backgroundTimer;
        private const float MAX_BACKGROUND_TIME = 30f;

        // Tutorial
        [Header("Tutorial")]
        [SerializeField] private GameObject _tutorialSwipeLeftRight;
        [SerializeField] private GameObject _tutorialSwipeUp;
        [SerializeField] private GameObject _tutorialSwipeDown;
        private bool _isTutorial;
        private int _tutorialStep;

        private void Awake()
        {
            ServiceLocator.Register(this);

            // Auto-setup all visuals if NeonBootstrap not already in scene
            if (FindAnyObjectByType<Rendering.NeonBootstrap>() == null)
            {
                var bootstrap = new GameObject("[NeonBootstrap]");
                bootstrap.AddComponent<Rendering.NeonBootstrap>();
            }
        }

        private void Start()
        {
            ServiceLocator.TryGet<OGHubBridge>(out var bridge);
            bool isCompetitive = bridge != null && bridge.IsCompetitive;

            _mode = isCompetitive ? GameMode.Competitive : GameMode.Practice;

            if (isCompetitive)
            {
                _config = bridge.CurrentConfig;
                StartCompetitiveFlow(bridge);
            }
            else
            {
                bool isTutorial = PlayerPrefs.GetInt("hasCompletedTutorial", 0) == 0;
                long seed = isTutorial ? 42L : System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                _config = new GameConfig
                {
                    Seed = seed,
                    Modifiers = GameModifiers.None,
                    StartingLives = 3,
                    TimeLimitSeconds = Fixed.Zero
                };
                _isTutorial = isTutorial;
                InitializeAndCountdown();
            }
        }

        private void StartCompetitiveFlow(OGHubBridge bridge)
        {
            // Set up live validation snapshot provider
            bridge.ValidationSnapshotProvider = () =>
            {
                if (_simulation == null) return new Dictionary<string, object>();
                var snap = _simulation.GetSnapshot();
                return new Dictionary<string, object>
                {
                    { "current_score", snap.Score },
                    { "current_lane", (int)snap.Runner.Lane },
                    { "player_alive", !_simulation.IsGameOver },
                    { "current_tick", snap.Runner.CurrentTick },
                };
            };

            bridge.StartGameplay();
            InitializeAndCountdown();
        }

        private void InitializeAndCountdown()
        {
            _simulation = new SimulationManager(_config);
            _inputManager = new TickInputManager();
            _accumulator = 0f;
            _lastScore = 0;
            _lastComboCount = 0;
            _lastLives = _config.StartingLives;
            _ghostDeltaTicks = 0;

            if (ServiceLocator.TryGet<UIManager>(out var ui))
                ui.Initialize(_mode == GameMode.Competitive);

            if (ServiceLocator.TryGet<Audio.AudioManager>(out var audio))
                audio.PlayMusic(isGameplay: true);

            ApplyQualityTier();

            if (_countdownUI != null)
            {
                _countdownUI.StartCountdown(() =>
                {
                    _isRunning = true;
                    _hasStarted = true;
                    GameEvents.FireGameStart();
                });
            }
            else
            {
                // No countdown UI — start immediately
                _isRunning = true;
                _hasStarted = true;
                GameEvents.FireGameStart();
            }
        }

        private void Update()
        {
            if (!_isRunning || _isPaused) return;

            if (_swipeDetector != null)
            {
                var action = _swipeDetector.ConsumeAction();
                if (action != InputAction.None)
                {
                    _inputManager.RegisterInput(action);

                    // Report input to SDK for anti-cheat timeline
                    if (_mode == GameMode.Competitive && ServiceLocator.TryGet<OGHubBridge>(out var bridge))
                        bridge.ReportInput(action);
                }
            }

            _accumulator += Time.deltaTime;
            while (_accumulator >= TICK_TIME)
            {
                _accumulator -= TICK_TIME;
                CommitTick();
            }

            float alpha = _accumulator / TICK_TIME;
            Render(alpha);
        }

        private void CommitTick()
        {
            int tick = _simulation.CurrentTick;
            _inputManager.CommitTick(tick);
            var input = _inputManager.GetActionForTick(tick);

            _simulation.Tick(input);

            _ghostManager?.Tick();

            var snapshot = _simulation.GetSnapshot();

            FireSimulationEvents(snapshot, input);

            if (_isTutorial)
                CheckTutorialPrompts(snapshot);

            _ghostDeltaTicks++;
            if (_ghostDeltaTicks >= GHOST_DELTA_INTERVAL && _ghostManager != null)
            {
                _ghostDeltaTicks = 0;
                foreach (var ghost in _ghostManager.GetGhostSnapshots())
                {
                    int delta = snapshot.Score - ghost.Snapshot.Score;
                    GameEvents.FireGhostDelta(new GhostDeltaArgs(delta, ghost.PlayerName));
                }
            }

            if (_simulation.IsGameOver)
            {
                _isRunning = false;
                GameEvents.FireGameOver(new GameOverArgs(snapshot.Score, snapshot.Runner.CurrentTick));
                StartCoroutine(DeathSlowMo(snapshot));
            }
        }

        private void FireSimulationEvents(SimulationSnapshot snapshot, InputAction input)
        {
            if (snapshot.Score != _lastScore)
            {
                GameEvents.FireScoreChanged(new ScoreChangedArgs(snapshot.Score, snapshot.Score - _lastScore));
                _lastScore = snapshot.Score;

                // Report score to SDK for live validation
                if (_mode == GameMode.Competitive && ServiceLocator.TryGet<OGHubBridge>(out var bridge))
                    bridge.UpdateScore(snapshot.Score);
            }

            if (snapshot.ComboCount != _lastComboCount)
            {
                GameEvents.FireComboChanged(new ComboChangedArgs(snapshot.ComboCount, snapshot.ComboMultiplier.ToFloat()));

                if (snapshot.ComboCount > 0 && snapshot.ComboCount % 5 == 0 && snapshot.ComboCount > _lastComboCount)
                    GameEvents.FireComboMilestone(snapshot.ComboCount);

                _lastComboCount = snapshot.ComboCount;
            }

            if (snapshot.Runner.Lives < _lastLives)
            {
                GameEvents.FireHit(new HitArgs(snapshot.Runner.Lives));
                _lastLives = snapshot.Runner.Lives;
            }
        }

        private void Render(float alpha)
        {
            var snapshot = _simulation.GetSnapshot();

            if (_runnerRenderer != null)
            {
                _runnerRenderer.UpdateVisuals(snapshot.Runner, alpha);
                _runnerRenderer.UpdateComboGlow(snapshot.ComboCount, 20f);
            }

            if (_obstacleRenderer != null)
                _obstacleRenderer.UpdateObstacles(_simulation.GetObstacles());

            if (ServiceLocator.TryGet<CameraController>(out var cam))
            {
                var pos = _runnerRenderer.transform.position;
                cam.UpdateCamera(pos, snapshot.Runner.Speed.ToFloat());
            }

            if (ServiceLocator.TryGet<EnvironmentRenderer>(out var env))
                env.UpdateEnvironment(snapshot.Runner.Speed.ToFloat(), Time.deltaTime);

            if (ServiceLocator.TryGet<ScreenEffects>(out var fx))
            {
                float vignetteIntensity = snapshot.Phase switch
                {
                    GamePhase.Onboarding => 0.2f,
                    GamePhase.SkillZone => 0.25f,
                    GamePhase.Escalation => 0.32f,
                    GamePhase.Endgame => 0.4f,
                    _ => 0.25f
                };
                fx.SetPhaseVignette(vignetteIntensity);
            }
        }

        private System.Collections.IEnumerator DeathSlowMo(SimulationSnapshot snapshot)
        {
            // Slow-mo effect on death
            Time.timeScale = 0.3f;
            yield return new WaitForSecondsRealtime(0.6f);
            Time.timeScale = 1f;
            HandleGameOver(snapshot);
        }

        private async void HandleGameOver(SimulationSnapshot snapshot)
        {
            if (_mode == GameMode.Practice)
            {
                PlayerPrefs.SetInt("hasCompletedTutorial", 1);

                int best = PlayerPrefs.GetInt("BestPracticeScore", 0);
                if (snapshot.Score > best)
                {
                    var replay = ReplaySystem.CreateReplay(snapshot, _config, _inputManager.RecordedInputs);
                    PlayerPrefs.SetString("BestPracticeReplay", JsonUtility.ToJson(replay));
                }
            }

            SessionOutcome outcome = null;

            if (_mode == GameMode.Competitive)
            {
                ServiceLocator.TryGet<OGHubBridge>(out var bridge);
                if (bridge != null)
                {
                    var sdkResult = await bridge.SubmitFinalScore();
                    if (sdkResult != null)
                    {
                        outcome = new SessionOutcome
                        {
                            accepted = sdkResult.accepted,
                            score = sdkResult.score,
                            rank = sdkResult.rank,
                        };

                        // Parse near-miss info if available
                        if (!string.IsNullOrEmpty(sdkResult.nearMissJson))
                        {
                            try { outcome.nearMiss = JsonUtility.FromJson<NearMissInfo>(sdkResult.nearMissJson); }
                            catch { /* near-miss data unavailable */ }
                        }
                    }
                }
            }

            if (ServiceLocator.TryGet<SceneController>(out var scene))
            {
                scene.LoadScene("ResultsScene", () =>
                {
                    var resultsUI = FindAnyObjectByType<ResultsScreenUI>();
                    resultsUI?.Show(snapshot, _mode == GameMode.Competitive, outcome);
                });
            }
            else
            {
                // No SceneController — load MainMenu or restart after delay
                Debug.Log($"[GameManager] Game Over! Score: {snapshot.Score}");
                if (ServiceLocator.TryGet<UIManager>(out var ui))
                    ui.ShowGameOver(snapshot.Score);
                StartCoroutine(GameOverFallback(snapshot));
            }
        }

        private System.Collections.IEnumerator GameOverFallback(SimulationSnapshot snapshot)
        {
            yield return new WaitForSecondsRealtime(1.5f);

            // Try to load ResultsScene, then MainMenu, then restart
            var sceneName = "ResultsScene";
            if (Application.CanStreamedLevelBeLoaded(sceneName))
            {
                UnityEngine.SceneManagement.SceneManager.LoadScene(sceneName);
            }
            else if (Application.CanStreamedLevelBeLoaded("MainMenuScene"))
            {
                UnityEngine.SceneManagement.SceneManager.LoadScene("MainMenuScene");
            }
            else
            {
                UnityEngine.SceneManagement.SceneManager.LoadScene(
                    UnityEngine.SceneManagement.SceneManager.GetActiveScene().name);
            }
        }

        public void TogglePause()
        {
            if (_mode == GameMode.Competitive || !_hasStarted) return;

            if (_isPaused)
            {
                _isPaused = false;
                if (_pauseMenuUI != null) _pauseMenuUI.Hide();
            }
            else
            {
                _isPaused = true;
                if (_pauseMenuUI != null) _pauseMenuUI.Show();
            }
        }

        private void CheckTutorialPrompts(SimulationSnapshot snapshot)
        {
            // Skip tutorial prompts if UI objects aren't wired
            if (_tutorialSwipeLeftRight == null && _tutorialSwipeUp == null && _tutorialSwipeDown == null)
            {
                _tutorialStep = 4; // Mark tutorial as done
                return;
            }

            switch (_tutorialStep)
            {
                case 0 when snapshot.Runner.CurrentTick >= 150:
                    if (_tutorialSwipeLeftRight != null) _tutorialSwipeLeftRight.SetActive(true);
                    _tutorialStep = 1;
                    break;
                case 1 when snapshot.Runner.CurrentTick >= 330:
                    if (_tutorialSwipeLeftRight != null) _tutorialSwipeLeftRight.SetActive(false);
                    if (_tutorialSwipeUp != null) _tutorialSwipeUp.SetActive(true);
                    _tutorialStep = 2;
                    break;
                case 2 when snapshot.Runner.CurrentTick >= 510:
                    if (_tutorialSwipeUp != null) _tutorialSwipeUp.SetActive(false);
                    if (_tutorialSwipeDown != null) _tutorialSwipeDown.SetActive(true);
                    _tutorialStep = 3;
                    break;
                case 3 when snapshot.Runner.CurrentTick >= 690:
                    if (_tutorialSwipeDown != null) _tutorialSwipeDown.SetActive(false);
                    _tutorialStep = 4;
                    break;
            }
        }

        private void OnApplicationPause(bool paused)
        {
            if (_mode != GameMode.Competitive || !_hasStarted) return;

            if (paused)
            {
                _backgroundTimer = 0f;
            }
        }

        private void OnApplicationFocus(bool hasFocus)
        {
            if (_mode != GameMode.Competitive || !_hasStarted) return;

            if (!hasFocus)
            {
                _backgroundTimer = Time.realtimeSinceStartup;
            }
            else if (_backgroundTimer > 0)
            {
                float elapsed = Time.realtimeSinceStartup - _backgroundTimer;
                if (elapsed > MAX_BACKGROUND_TIME)
                {
                    _isRunning = false;
                    var snapshot = _simulation.GetSnapshot();
                    GameEvents.FireGameOver(new GameOverArgs(snapshot.Score, snapshot.Runner.CurrentTick));
                    HandleGameOver(snapshot);
                }
                _backgroundTimer = 0f;
            }
        }

        private void ApplyQualityTier()
        {
            int tier = 1;
            int ram = SystemInfo.systemMemorySize;
            int vram = SystemInfo.graphicsMemorySize;

            if (ram < 3072 || vram < 1024)
                tier = 0;
            else if (Screen.currentResolution.refreshRateRatio.value >= 120 && ram >= 6144)
                tier = 2;

            Application.targetFrameRate = tier switch
            {
                0 => 30,
                2 => 120,
                _ => 60
            };

            Screen.sleepTimeout = SleepTimeout.NeverSleep;

            if (ServiceLocator.TryGet<ScreenEffects>(out var fx))
                fx.ApplyQualityTier(tier);

            if (ServiceLocator.TryGet<EnvironmentRenderer>(out var env))
                env.SetPulseEnabled(tier > 0);
        }

        private void OnDestroy()
        {
            Screen.sleepTimeout = SleepTimeout.SystemSetting;
            GameEvents.ClearAll();
            ServiceLocator.Unregister<GameManager>();
        }
    }
}
