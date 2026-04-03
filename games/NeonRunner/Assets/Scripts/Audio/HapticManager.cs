// Assets/Scripts/Audio/HapticManager.cs
using UnityEngine;
using NeonRunner.Events;
using NeonRunner.Game;

namespace NeonRunner.Audio
{
    public sealed class HapticManager : MonoBehaviour
    {
        public enum HapticIntensity { Light, Medium, Heavy }

        private bool _enabled = true;

        private void Awake()
        {
            ServiceLocator.Register(this);
            _enabled = PlayerPrefs.GetInt("HapticsEnabled", 1) == 1;
        }

        private void OnEnable()
        {
            GameEvents.OnLaneSwitch += HandleLaneSwitch;
            GameEvents.OnNearMiss += HandleNearMiss;
            GameEvents.OnHit += HandleHit;
        }

        private void OnDisable()
        {
            GameEvents.OnLaneSwitch -= HandleLaneSwitch;
            GameEvents.OnNearMiss -= HandleNearMiss;
            GameEvents.OnHit -= HandleHit;
        }

        public void SetEnabled(bool enabled)
        {
            _enabled = enabled;
            PlayerPrefs.SetInt("HapticsEnabled", enabled ? 1 : 0);
        }

        public bool IsEnabled => _enabled;

        private void HandleLaneSwitch(LaneSwitchArgs _) => Vibrate(HapticIntensity.Light);
        private void HandleNearMiss(NearMissArgs _) => Vibrate(HapticIntensity.Medium);
        private void HandleHit(HitArgs _) => Vibrate(HapticIntensity.Heavy);

        public void Vibrate(HapticIntensity intensity)
        {
            if (!_enabled) return;

#if UNITY_IOS && !UNITY_EDITOR
            switch (intensity)
            {
                case HapticIntensity.Light:
                    UnityEngine.iOS.HapticFeedback.Trigger(UnityEngine.iOS.HapticFeedback.Type.ImpactLight);
                    break;
                case HapticIntensity.Medium:
                    UnityEngine.iOS.HapticFeedback.Trigger(UnityEngine.iOS.HapticFeedback.Type.ImpactMedium);
                    break;
                case HapticIntensity.Heavy:
                    UnityEngine.iOS.HapticFeedback.Trigger(UnityEngine.iOS.HapticFeedback.Type.ImpactHeavy);
                    break;
            }
#elif UNITY_ANDROID && !UNITY_EDITOR
            long ms = intensity switch
            {
                HapticIntensity.Light => 15,
                HapticIntensity.Medium => 30,
                HapticIntensity.Heavy => 60,
                _ => 15
            };
            try
            {
                using var unityPlayer = new AndroidJavaClass("com.unity3d.player.UnityPlayer");
                using var activity = unityPlayer.GetStatic<AndroidJavaObject>("currentActivity");
                using var vibrator = activity.Call<AndroidJavaObject>("getSystemService", "vibrator");
                using var effectClass = new AndroidJavaClass("android.os.VibrationEffect");
                int amplitude = intensity switch
                {
                    HapticIntensity.Light => 50,
                    HapticIntensity.Medium => 128,
                    HapticIntensity.Heavy => 255,
                    _ => 50
                };
                using var effect = effectClass.CallStatic<AndroidJavaObject>("createOneShot", ms, amplitude);
                vibrator.Call("vibrate", effect);
            }
            catch (System.Exception e)
            {
                Debug.LogWarning($"[HapticManager] Android vibration failed: {e.Message}");
            }
#endif
        }

        private void OnDestroy()
        {
            ServiceLocator.Unregister<HapticManager>();
        }
    }
}
