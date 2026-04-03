using UnityEngine;
using UnityEngine.UI;
using TMPro;
using DG.Tweening;
using NeonRunner.Audio;
using NeonRunner.Game;

namespace NeonRunner.UI
{
    public sealed class MainMenuUI : MonoBehaviour
    {
        [Header("Elements")]
        [SerializeField] private TMP_Text _titleText;
        [SerializeField] private Button _playButton;
        [SerializeField] private TMP_Text _bestScoreText;
        [SerializeField] private Button _settingsButton;
        [SerializeField] private GameObject _settingsPanel;

        private void Start()
        {
            int bestScore = PlayerPrefs.GetInt("BestPracticeScore", 0);
            _bestScoreText.SetText("BEST: {0:0}", bestScore);

            _playButton.onClick.AddListener(OnPlayClicked);
            _settingsButton.onClick.AddListener(OnSettingsClicked);

            _playButton.transform.DOScale(1.05f, 0.8f)
                .SetLoops(-1, LoopType.Yoyo)
                .SetEase(Ease.InOutSine);

            if (_titleText != null)
            {
                _titleText.DOFade(0.85f, 0.1f)
                    .SetLoops(-1, LoopType.Yoyo)
                    .SetDelay(Random.Range(2f, 5f));
            }

            if (ServiceLocator.TryGet<AudioManager>(out var audio))
                audio.PlayMusic(isGameplay: false);
        }

        private void OnPlayClicked()
        {
            if (ServiceLocator.TryGet<AudioManager>(out var audio))
                audio.PlayUIClick();

            var scene = ServiceLocator.Get<SceneController>();
            scene?.LoadScene("GameplayScene");
        }

        private void OnSettingsClicked()
        {
            if (ServiceLocator.TryGet<AudioManager>(out var audio))
                audio.PlayUIClick();

            _settingsPanel.SetActive(true);
        }

        private void OnDestroy()
        {
            _playButton.onClick.RemoveAllListeners();
            _settingsButton.onClick.RemoveAllListeners();
        }
    }
}
