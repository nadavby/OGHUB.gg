using UnityEngine;
using UnityEngine.UI;
using NeonRunner.Audio;
using NeonRunner.Events;
using NeonRunner.Game;

namespace NeonRunner.UI
{
    public sealed class PauseMenuUI : MonoBehaviour
    {
        [SerializeField] private CanvasGroup _overlay;
        [SerializeField] private Button _resumeButton;
        [SerializeField] private Button _restartButton;
        [SerializeField] private Button _quitButton;

        private void Awake()
        {
            _resumeButton.onClick.AddListener(OnResume);
            _restartButton.onClick.AddListener(OnRestart);
            _quitButton.onClick.AddListener(OnQuit);
            gameObject.SetActive(false);
        }

        public void Show()
        {
            gameObject.SetActive(true);
            _overlay.alpha = 1f;
            Time.timeScale = 0f;
            GameEvents.FirePause();
        }

        public void Hide()
        {
            Time.timeScale = 1f;
            gameObject.SetActive(false);
            GameEvents.FireResume();
        }

        private void OnResume()
        {
            PlayClick();
            Hide();
        }

        private void OnRestart()
        {
            PlayClick();
            Time.timeScale = 1f;
            var scene = ServiceLocator.Get<SceneController>();
            scene?.LoadScene("GameplayScene");
        }

        private void OnQuit()
        {
            PlayClick();
            Time.timeScale = 1f;
            var scene = ServiceLocator.Get<SceneController>();
            scene?.LoadScene("MainMenuScene");
        }

        private void PlayClick()
        {
            if (ServiceLocator.TryGet<AudioManager>(out var audio))
                audio.PlayUIClick();
        }

        private void OnDestroy()
        {
            _resumeButton.onClick.RemoveAllListeners();
            _restartButton.onClick.RemoveAllListeners();
            _quitButton.onClick.RemoveAllListeners();
        }
    }
}
