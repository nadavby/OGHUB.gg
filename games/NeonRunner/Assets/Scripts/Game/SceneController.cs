// Assets/Scripts/Game/SceneController.cs
using System;
using System.Collections;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace NeonRunner.Game
{
    public sealed class SceneController : MonoBehaviour
    {
        [SerializeField] private CanvasGroup _fadeOverlay;
        [SerializeField] private float _fadeDuration = 0.4f;

        private bool _isTransitioning;

        private void Awake()
        {
            ServiceLocator.Register(this);
            DontDestroyOnLoad(gameObject);
            if (_fadeOverlay != null)
            {
                _fadeOverlay.alpha = 1f;
                _fadeOverlay.blocksRaycasts = true;
            }
        }

        public void FadeIn(Action onComplete = null)
        {
            if (_fadeOverlay != null)
                StartCoroutine(Fade(1f, 0f, onComplete));
            else
                onComplete?.Invoke();
        }

        public void LoadScene(string sceneName, Action onLoaded = null)
        {
            if (_isTransitioning) return;
            StartCoroutine(TransitionCoroutine(sceneName, onLoaded));
        }

        private IEnumerator TransitionCoroutine(string sceneName, Action onLoaded)
        {
            _isTransitioning = true;

            if (_fadeOverlay != null)
            {
                yield return Fade(0f, 1f, null);
            }

            var op = SceneManager.LoadSceneAsync(sceneName);
            while (op != null && !op.isDone)
                yield return null;

            onLoaded?.Invoke();

            if (_fadeOverlay != null)
            {
                yield return Fade(1f, 0f, null);
            }

            _isTransitioning = false;
        }

        private IEnumerator Fade(float from, float to, Action onComplete)
        {
            if (_fadeOverlay == null) { onComplete?.Invoke(); yield break; }

            _fadeOverlay.blocksRaycasts = true;
            float elapsed = 0f;
            _fadeOverlay.alpha = from;

            while (elapsed < _fadeDuration)
            {
                elapsed += Time.unscaledDeltaTime;
                _fadeOverlay.alpha = Mathf.Lerp(from, to, elapsed / _fadeDuration);
                yield return null;
            }

            _fadeOverlay.alpha = to;
            _fadeOverlay.blocksRaycasts = to > 0.5f;
            onComplete?.Invoke();
        }

        private void OnDestroy()
        {
            ServiceLocator.Unregister<SceneController>();
        }
    }
}
