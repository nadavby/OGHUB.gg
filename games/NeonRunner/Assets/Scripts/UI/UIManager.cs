using UnityEngine;
using TMPro;
using DG.Tweening;
using NeonRunner.Events;
using NeonRunner.Game;

namespace NeonRunner.UI
{
    public sealed class UIManager : MonoBehaviour
    {
        [Header("Score")]
        [SerializeField] private TMP_Text _scoreText;

        [Header("Combo")]
        [SerializeField] private TMP_Text _comboText;
        [SerializeField] private CanvasGroup _comboGroup;

        [Header("Lives")]
        [SerializeField] private GameObject[] _heartIcons;

        [Header("Mode")]
        [SerializeField] private TMP_Text _modeBadge;

        [Header("Ghost Delta")]
        [SerializeField] private TMP_Text _ghostDeltaText;
        [SerializeField] private GameObject _ghostDeltaRoot;

        [Header("Pause")]
        [SerializeField] private GameObject _pauseButton;

        [Header("Safe Area")]
        [SerializeField] private RectTransform _safeAreaPanel;

        private int _displayedScore;
        private Tween _scoreCountTween;

        private void Awake()
        {
            ServiceLocator.Register(this);
            ApplySafeArea();
        }

        private void OnEnable()
        {
            GameEvents.OnScoreChanged += HandleScoreChanged;
            GameEvents.OnComboChanged += HandleComboChanged;
            GameEvents.OnHit += HandleHit;
            GameEvents.OnGhostDelta += HandleGhostDelta;
            GameEvents.OnComboMilestone += HandleComboMilestone;
        }

        private void OnDisable()
        {
            GameEvents.OnScoreChanged -= HandleScoreChanged;
            GameEvents.OnComboChanged -= HandleComboChanged;
            GameEvents.OnHit -= HandleHit;
            GameEvents.OnGhostDelta -= HandleGhostDelta;
            GameEvents.OnComboMilestone -= HandleComboMilestone;
        }

        public void Initialize(bool isCompetitive)
        {
            _modeBadge.gameObject.SetActive(!isCompetitive);
            _ghostDeltaRoot.SetActive(isCompetitive);
            _pauseButton.SetActive(!isCompetitive);

            _scoreText.SetText("0");
            _comboGroup.alpha = 0f;
            _displayedScore = 0;

            for (int i = 0; i < _heartIcons.Length; i++)
                _heartIcons[i].SetActive(true);
        }

        private void HandleScoreChanged(ScoreChangedArgs args)
        {
            _scoreCountTween?.Kill();
            int target = args.NewScore;
            _scoreCountTween = DOTween.To(
                () => _displayedScore,
                x =>
                {
                    _displayedScore = x;
                    _scoreText.SetText("{0:0}", _displayedScore);
                },
                target,
                0.3f
            ).SetEase(Ease.OutQuad);
        }

        private void HandleComboChanged(ComboChangedArgs args)
        {
            if (args.ComboCount <= 0)
            {
                _comboGroup.DOFade(0f, 0.2f);
                return;
            }

            _comboGroup.alpha = 1f;
            _comboText.SetText("x{0:0.0}", args.Multiplier);

            _comboText.transform.DOKill();
            _comboText.transform.localScale = Vector3.one;
            _comboText.transform.DOPunchScale(Vector3.one * 0.3f, 0.15f, 1);
        }

        private void HandleComboMilestone(int comboCount)
        {
            _comboText.transform.DOKill();
            _comboText.transform.localScale = Vector3.one;
            _comboText.transform.DOPunchScale(Vector3.one * 0.6f, 0.25f, 1);
        }

        private void HandleHit(HitArgs args)
        {
            int heartIndex = args.RemainingLives;
            if (heartIndex >= 0 && heartIndex < _heartIcons.Length)
            {
                var heart = _heartIcons[heartIndex];
                heart.transform.DOPunchScale(Vector3.one * 0.5f, 0.2f, 1).OnComplete(() =>
                {
                    heart.SetActive(false);
                });

                for (int i = 0; i < heartIndex; i++)
                {
                    _heartIcons[i].transform.DOShakePosition(0.2f, 3f, 20);
                }
            }
        }

        private void HandleGhostDelta(GhostDeltaArgs args)
        {
            if (!_ghostDeltaRoot.activeSelf) return;

            bool ahead = args.ScoreDifference >= 0;
            _ghostDeltaText.color = ahead ? new Color(0.22f, 1f, 0.08f) : new Color(1f, 0.27f, 0.27f);
            string prefix = ahead ? "+" : "";
            _ghostDeltaText.SetText("{0}{1:0}", prefix, args.ScoreDifference);

            _ghostDeltaText.transform.DOKill();
            _ghostDeltaText.transform.localScale = Vector3.one;
            _ghostDeltaText.transform.DOPunchScale(Vector3.one * 0.2f, 0.15f, 1);
        }

        private void ApplySafeArea()
        {
            if (_safeAreaPanel == null) return;
            Rect safeArea = Screen.safeArea;
            Vector2 anchorMin = safeArea.position;
            Vector2 anchorMax = safeArea.position + safeArea.size;
            anchorMin.x /= Screen.width;
            anchorMin.y /= Screen.height;
            anchorMax.x /= Screen.width;
            anchorMax.y /= Screen.height;
            _safeAreaPanel.anchorMin = anchorMin;
            _safeAreaPanel.anchorMax = anchorMax;
        }

        private void OnDestroy()
        {
            _scoreCountTween?.Kill();
            ServiceLocator.Unregister<UIManager>();
        }
    }
}
