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
        }

        private void Start()
        {
            var bridge = ServiceLocator.Get<OGHubBridge>();
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

        private async void StartCompetitiveFlow(OGHubBridge bridge)
        {
            bool valid = await bridge.ValidateSession();
            if (!valid)
            {
                Debug.LogError("[GameManager] Session validation failed");
                return;
            }

            if (bridge.LoadedGhost != null)
            {
                _ghostManager = new GhostManager();
                var ghost = bridge.LoadedGhost;
                var replayData = new ReplayData
                {
                    Seed = ghost.Seed,
                    Modifiers = _config.Modifiers,
                    StartingLives = _config.StartingLives,
                    Inputs = ghost.Inputs
                };
                _ghostManager.AddGhost(replayData, ghost.PlayerName);
            }

            bridge.MarkInProgress();
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

            _countdownUI.StartCountdown(() =>
            {
                _isRunning = true;
                _hasStarted = true;
                GameEvents.FireGameStart();
            });
        }

        private void Update()
        {
            if (!_isRunning || _isPaused) return;

            var action = _swipeDetector.ConsumeAction();
            if (action != InputAction.None)
                _inputManager.RegisterInput(action);

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
                HandleGameOver(snapshot);
            }
        }

        private void FireSimulationEvents(SimulationSnapshot snapshot, InputAction input)
        {
            if (snapshot.Score != _lastScore)
            {
                GameEvents.FireScoreChanged(new ScoreChangedArgs(snapshot.Score, snapshot.Score - _lastScore));
                _lastScore = snapshot.Score;
            }

            if (snapshot.ComboCount != _lastComboCount)
            {
                GameEvents.FireComboChanged(new ComboChangedArgs(snapshot.ComboCount, (float)snapshot.ComboMultiplier));

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

            _runnerRenderer.UpdateVisuals(snapshot.Runner, alpha);
            _runnerRenderer.UpdateComboGlow(snapshot.ComboCount, 20f);

            _obstacleRenderer.UpdateObstacles(_simulation.GetObstacles());

            if (ServiceLocator.TryGet<CameraController>(out var cam))
            {
                var pos = _runnerRenderer.transform.position;
                cam.UpdateCamera(pos, (float)snapshot.Runner.Speed);
            }

            if (ServiceLocator.TryGet<EnvironmentRenderer>(out var env))
                env.UpdateEnvironment((float)snapshot.Runner.Speed, Time.deltaTime);

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
                var bridge = ServiceLocator.Get<OGHubBridge>();
                if (bridge != null)
                {
                    var replay = ReplaySystem.CreateReplay(snapshot, _config, _inputManager.RecordedInputs);
                    outcome = await bridge.SubmitScore(replay);
                }
            }

            var scene = ServiceLocator.Get<SceneController>();
            scene?.LoadScene("ResultsScene", () =>
            {
                var resultsUI = FindAnyObjectByType<ResultsScreenUI>();
                resultsUI?.Show(snapshot, _mode == GameMode.Competitive, outcome);
            });
        }

        public void TogglePause()
        {
            if (_mode == GameMode.Competitive || !_hasStarted) return;

            if (_isPaused)
            {
                _isPaused = false;
                _pauseMenuUI.Hide();
            }
            else
            {
                _isPaused = true;
                _pauseMenuUI.Show();
            }
        }

        private void CheckTutorialPrompts(SimulationSnapshot snapshot)
        {
            switch (_tutorialStep)
            {
                case 0 when snapshot.Runner.CurrentTick >= 150:
                    _tutorialSwipeLeftRight?.SetActive(true);
                    _tutorialStep = 1;
                    break;
                case 1 when snapshot.Runner.CurrentTick >= 330:
                    _tutorialSwipeLeftRight?.SetActive(false);
                    _tutorialSwipeUp?.SetActive(true);
                    _tutorialStep = 2;
                    break;
                case 2 when snapshot.Runner.CurrentTick >= 510:
                    _tutorialSwipeUp?.SetActive(false);
                    _tutorialSwipeDown?.SetActive(true);
                    _tutorialStep = 3;
                    break;
                case 3 when snapshot.Runner.CurrentTick >= 690:
                    _tutorialSwipeDown?.SetActive(false);
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
            else if (Screen.currentResolution.refreshRate >= 120 && ram >= 6144)
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
