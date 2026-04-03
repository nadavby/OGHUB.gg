using System.Collections;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using DG.Tweening;
using NeonRunner.Audio;
using NeonRunner.Core;
using NeonRunner.Game;
using NeonRunner.SDK;

namespace NeonRunner.UI
{
    public sealed class ResultsScreenUI : MonoBehaviour
    {
        [Header("Common")]
        [SerializeField] private TMP_Text _headerText;
        [SerializeField] private TMP_Text _scoreText;
        [SerializeField] private TMP_Text _distanceText;
        [SerializeField] private TMP_Text _nearMissesText;
        [SerializeField] private TMP_Text _perfectDodgesText;
        [SerializeField] private TMP_Text _maxComboText;
        [SerializeField] private TMP_Text _skillGatesText;
        [SerializeField] private CanvasGroup[] _statRows;

        [Header("Competitive")]
        [SerializeField] private GameObject _rankSection;
        [SerializeField] private TMP_Text _rankText;
        [SerializeField] private TMP_Text _nearMissToRankText;

        [Header("Buttons")]
        [SerializeField] private Button _playAgainButton;
        [SerializeField] private Button _menuButton;
        [SerializeField] private Button _returnToOGHubButton;

        public void Show(SimulationSnapshot snapshot, bool isCompetitive, SessionOutcome outcome)
        {
            gameObject.SetActive(true);

            _headerText.text = isCompetitive ? "CHALLENGE COMPLETE" : "RUN COMPLETE";

            _rankSection.SetActive(isCompetitive && outcome != null);
            _playAgainButton.gameObject.SetActive(!isCompetitive);
            _menuButton.gameObject.SetActive(!isCompetitive);
            _returnToOGHubButton.gameObject.SetActive(isCompetitive);

            _playAgainButton.onClick.RemoveAllListeners();
            _playAgainButton.onClick.AddListener(OnPlayAgain);
            _menuButton.onClick.RemoveAllListeners();
            _menuButton.onClick.AddListener(OnMenu);
            _returnToOGHubButton.onClick.RemoveAllListeners();
            _returnToOGHubButton.onClick.AddListener(OnReturnToOGHub);

            if (!isCompetitive)
            {
                int best = PlayerPrefs.GetInt("BestPracticeScore", 0);
                if (snapshot.Score > best)
                    PlayerPrefs.SetInt("BestPracticeScore", snapshot.Score);
            }

            StartCoroutine(AnimateResults(snapshot, isCompetitive, outcome));
        }

        private IEnumerator AnimateResults(SimulationSnapshot snapshot, bool isCompetitive, SessionOutcome outcome)
        {
            foreach (var row in _statRows)
                row.alpha = 0f;

            _scoreText.SetText("0");
            int displayScore = 0;
            DOTween.To(() => displayScore, x =>
            {
                displayScore = x;
                _scoreText.SetText("{0:0}", displayScore);
            }, snapshot.Score, 1.5f).SetEase(Ease.OutQuad);

            yield return new WaitForSeconds(1.6f);

            if (isCompetitive && outcome != null && outcome.rank > 0)
            {
                _rankText.SetText("#{0}", outcome.rank);
                _rankText.transform.localScale = Vector3.one * 2f;
                _rankText.transform.DOScale(Vector3.one, 0.3f).SetEase(Ease.OutBack);

                if (outcome.nearMiss != null)
                    _nearMissToRankText.text = outcome.nearMiss.message;

                yield return new WaitForSeconds(0.5f);
            }

            string[] values =
            {
                $"{(float)snapshot.Runner.TotalDistance:F0}m",
                snapshot.NearMisses.ToString(),
                snapshot.PerfectDodges.ToString(),
                $"{snapshot.MaxCombo}x",
                snapshot.SkillGatesPassed.ToString()
            };
            TMP_Text[] texts = { _distanceText, _nearMissesText, _perfectDodgesText, _maxComboText, _skillGatesText };

            for (int i = 0; i < _statRows.Length && i < values.Length; i++)
            {
                texts[i].text = values[i];
                _statRows[i].DOFade(1f, 0.2f);
                yield return new WaitForSeconds(0.15f);
            }
        }

        private void OnPlayAgain()
        {
            PlayClick();
            var scene = ServiceLocator.Get<SceneController>();
            scene?.LoadScene("GameplayScene");
        }

        private void OnMenu()
        {
            PlayClick();
            var scene = ServiceLocator.Get<SceneController>();
            scene?.LoadScene("MainMenuScene");
        }

        private void OnReturnToOGHub()
        {
            PlayClick();
            Application.OpenURL("oghub://");
        }

        private void PlayClick()
        {
            if (ServiceLocator.TryGet<AudioManager>(out var audio))
                audio.PlayUIClick();
        }
    }
}
