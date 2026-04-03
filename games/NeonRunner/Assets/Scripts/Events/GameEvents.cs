// Assets/Scripts/Events/GameEvents.cs
using System;

namespace NeonRunner.Events
{
    public readonly struct ScoreChangedArgs
    {
        public readonly int NewScore;
        public readonly int Delta;
        public ScoreChangedArgs(int newScore, int delta) { NewScore = newScore; Delta = delta; }
    }

    public readonly struct ComboChangedArgs
    {
        public readonly int ComboCount;
        public readonly float Multiplier;
        public ComboChangedArgs(int comboCount, float multiplier) { ComboCount = comboCount; Multiplier = multiplier; }
    }

    public readonly struct NearMissArgs
    {
        public readonly bool IsPerfect;
        public readonly int ComboCount;
        public NearMissArgs(bool isPerfect, int comboCount) { IsPerfect = isPerfect; ComboCount = comboCount; }
    }

    public readonly struct HitArgs
    {
        public readonly int RemainingLives;
        public HitArgs(int remainingLives) { RemainingLives = remainingLives; }
    }

    public readonly struct LaneSwitchArgs
    {
        public readonly int Direction; // -1 left, +1 right
        public LaneSwitchArgs(int direction) { Direction = direction; }
    }

    public readonly struct GhostDeltaArgs
    {
        public readonly int ScoreDifference; // positive = player ahead
        public readonly string GhostName;
        public GhostDeltaArgs(int scoreDifference, string ghostName)
        {
            ScoreDifference = scoreDifference;
            GhostName = ghostName;
        }
    }

    public readonly struct GameOverArgs
    {
        public readonly int FinalScore;
        public readonly int FinalTick;
        public GameOverArgs(int finalScore, int finalTick) { FinalScore = finalScore; FinalTick = finalTick; }
    }

    public static class GameEvents
    {
        public static event Action<ScoreChangedArgs> OnScoreChanged;
        public static event Action<ComboChangedArgs> OnComboChanged;
        public static event Action<NearMissArgs> OnNearMiss;
        public static event Action<HitArgs> OnHit;
        public static event Action<LaneSwitchArgs> OnLaneSwitch;
        public static event Action OnJump;
        public static event Action OnLand;
        public static event Action OnSlideStart;
        public static event Action OnSlideEnd;
        public static event Action<int> OnComboMilestone; // combo count
        public static event Action<GhostDeltaArgs> OnGhostDelta;
        public static event Action<GameOverArgs> OnGameOver;
        public static event Action OnCountdownTick; // 3, 2, 1
        public static event Action OnCountdownGo;
        public static event Action OnGameStart;
        public static event Action OnPause;
        public static event Action OnResume;

        public static void FireScoreChanged(ScoreChangedArgs args) => OnScoreChanged?.Invoke(args);
        public static void FireComboChanged(ComboChangedArgs args) => OnComboChanged?.Invoke(args);
        public static void FireNearMiss(NearMissArgs args) => OnNearMiss?.Invoke(args);
        public static void FireHit(HitArgs args) => OnHit?.Invoke(args);
        public static void FireLaneSwitch(LaneSwitchArgs args) => OnLaneSwitch?.Invoke(args);
        public static void FireJump() => OnJump?.Invoke();
        public static void FireLand() => OnLand?.Invoke();
        public static void FireSlideStart() => OnSlideStart?.Invoke();
        public static void FireSlideEnd() => OnSlideEnd?.Invoke();
        public static void FireComboMilestone(int count) => OnComboMilestone?.Invoke(count);
        public static void FireGhostDelta(GhostDeltaArgs args) => OnGhostDelta?.Invoke(args);
        public static void FireGameOver(GameOverArgs args) => OnGameOver?.Invoke(args);
        public static void FireCountdownTick() => OnCountdownTick?.Invoke();
        public static void FireCountdownGo() => OnCountdownGo?.Invoke();
        public static void FireGameStart() => OnGameStart?.Invoke();
        public static void FirePause() => OnPause?.Invoke();
        public static void FireResume() => OnResume?.Invoke();

        public static void ClearAll()
        {
            OnScoreChanged = null;
            OnComboChanged = null;
            OnNearMiss = null;
            OnHit = null;
            OnLaneSwitch = null;
            OnJump = null;
            OnLand = null;
            OnSlideStart = null;
            OnSlideEnd = null;
            OnComboMilestone = null;
            OnGhostDelta = null;
            OnGameOver = null;
            OnCountdownTick = null;
            OnCountdownGo = null;
            OnGameStart = null;
            OnPause = null;
            OnResume = null;
        }
    }
}
