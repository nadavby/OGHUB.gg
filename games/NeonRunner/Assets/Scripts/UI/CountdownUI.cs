using System;
using System.Collections;
using UnityEngine;
using TMPro;
using DG.Tweening;
using NeonRunner.Events;

namespace NeonRunner.UI
{
    public sealed class CountdownUI : MonoBehaviour
    {
        [SerializeField] private TMP_Text _countdownText;
        [SerializeField] private CanvasGroup _canvasGroup;

        private readonly Color _numberColor = new(0f, 1f, 1f, 1f);
        private readonly Color _goColor = new(1f, 0f, 1f, 1f);

        public void StartCountdown(Action onComplete)
        {
            gameObject.SetActive(true);
            _canvasGroup.alpha = 1f;
            StartCoroutine(CountdownCoroutine(onComplete));
        }

        private IEnumerator CountdownCoroutine(Action onComplete)
        {
            string[] steps = { "3", "2", "1", "GO!" };

            for (int i = 0; i < steps.Length; i++)
            {
                bool isGo = i == steps.Length - 1;
                _countdownText.text = steps[i];
                _countdownText.color = isGo ? _goColor : _numberColor;

                _countdownText.transform.localScale = Vector3.one * 2f;
                _countdownText.transform.DOScale(Vector3.one, 0.3f).SetEase(Ease.OutBack).SetUpdate(true);

                if (isGo)
                    GameEvents.FireCountdownGo();
                else
                    GameEvents.FireCountdownTick();

                yield return new WaitForSecondsRealtime(0.8f);

                _countdownText.DOFade(0f, 0.15f).SetUpdate(true);
                yield return new WaitForSecondsRealtime(0.15f);
                _countdownText.alpha = 1f;
            }

            _canvasGroup.DOFade(0f, 0.2f).SetUpdate(true).OnComplete(() =>
            {
                gameObject.SetActive(false);
            });

            onComplete?.Invoke();
        }
    }
}
