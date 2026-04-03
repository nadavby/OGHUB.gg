using UnityEngine;
using UnityEngine.UI;
using TMPro;
using NeonRunner.Audio;
using NeonRunner.Input;
using NeonRunner.Game;

namespace NeonRunner.UI
{
    public sealed class SettingsUI : MonoBehaviour
    {
        [Header("Volume")]
        [SerializeField] private Slider _musicSlider;
        [SerializeField] private Slider _sfxSlider;

        [Header("Sensitivity")]
        [SerializeField] private TMP_Text _sensitivityLabel;
        [SerializeField] private Button _sensitivityCycleButton;

        [Header("Haptics")]
        [SerializeField] private Toggle _hapticsToggle;

        [Header("Panel")]
        [SerializeField] private Button _closeButton;

        private SwipeDetector.Sensitivity _currentSensitivity;

        private void OnEnable()
        {
            if (ServiceLocator.TryGet<AudioManager>(out var audio))
            {
                _musicSlider.value = audio.GetMusicVolume();
                _sfxSlider.value = audio.GetSFXVolume();
            }

            _currentSensitivity = (SwipeDetector.Sensitivity)
                PlayerPrefs.GetInt("SwipeSensitivity", (int)SwipeDetector.Sensitivity.Medium);
            UpdateSensitivityLabel();

            if (ServiceLocator.TryGet<HapticManager>(out var haptic))
                _hapticsToggle.isOn = haptic.IsEnabled;

            _musicSlider.onValueChanged.AddListener(OnMusicChanged);
            _sfxSlider.onValueChanged.AddListener(OnSFXChanged);
            _sensitivityCycleButton.onClick.AddListener(OnSensitivityCycle);
            _hapticsToggle.onValueChanged.AddListener(OnHapticsChanged);
            _closeButton.onClick.AddListener(OnClose);
        }

        private void OnDisable()
        {
            _musicSlider.onValueChanged.RemoveAllListeners();
            _sfxSlider.onValueChanged.RemoveAllListeners();
            _sensitivityCycleButton.onClick.RemoveAllListeners();
            _hapticsToggle.onValueChanged.RemoveAllListeners();
            _closeButton.onClick.RemoveAllListeners();
        }

        private void OnMusicChanged(float value)
        {
            if (ServiceLocator.TryGet<AudioManager>(out var audio))
                audio.SetMusicVolume(value);
        }

        private void OnSFXChanged(float value)
        {
            if (ServiceLocator.TryGet<AudioManager>(out var audio))
                audio.SetSFXVolume(value);
        }

        private void OnSensitivityCycle()
        {
            _currentSensitivity = (SwipeDetector.Sensitivity)(((int)_currentSensitivity + 1) % 3);
            UpdateSensitivityLabel();

            var detector = FindAnyObjectByType<SwipeDetector>();
            detector?.SetSensitivity(_currentSensitivity);
        }

        private void UpdateSensitivityLabel()
        {
            _sensitivityLabel.text = _currentSensitivity switch
            {
                SwipeDetector.Sensitivity.Low => "LOW",
                SwipeDetector.Sensitivity.Medium => "MEDIUM",
                SwipeDetector.Sensitivity.High => "HIGH",
                _ => "MEDIUM"
            };
        }

        private void OnHapticsChanged(bool value)
        {
            if (ServiceLocator.TryGet<HapticManager>(out var haptic))
                haptic.SetEnabled(value);
        }

        private void OnClose()
        {
            if (ServiceLocator.TryGet<AudioManager>(out var audio))
                audio.PlayUIClick();
            gameObject.SetActive(false);
        }
    }
}
