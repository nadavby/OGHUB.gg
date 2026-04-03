// Assets/Scripts/Input/SwipeDetector.cs
using UnityEngine;
using UnityEngine.InputSystem.EnhancedTouch;
using NeonRunner.Core;
using Touch = UnityEngine.InputSystem.EnhancedTouch.Touch;
using TouchPhase = UnityEngine.InputSystem.TouchPhase;

namespace NeonRunner.Input
{
    public sealed class SwipeDetector : MonoBehaviour
    {
        public enum Sensitivity { Low, Medium, High }

        private const float MAX_SWIPE_TIME = 0.3f;
        private const float DEAD_ZONE_PERCENT = 0.1f;

        private static readonly float[] THRESHOLDS_CM = { 0.8f, 0.5f, 0.3f };

        private Sensitivity _sensitivity = Sensitivity.Medium;
        private float _thresholdPixels;

        private Vector2 _startPos;
        private float _startTime;
        private int _trackingFingerId = -1;

        private InputAction _bufferedAction = InputAction.None;

        public InputAction ConsumeAction()
        {
            var action = _bufferedAction;
            _bufferedAction = InputAction.None;
            return action;
        }

        private void OnEnable()
        {
            EnhancedTouchSupport.Enable();
            LoadSensitivity();
            RecalculateThreshold();
        }

        private void OnDisable()
        {
            EnhancedTouchSupport.Disable();
        }

        public void SetSensitivity(Sensitivity sens)
        {
            _sensitivity = sens;
            PlayerPrefs.SetInt("SwipeSensitivity", (int)sens);
            RecalculateThreshold();
        }

        private void LoadSensitivity()
        {
            _sensitivity = (Sensitivity)PlayerPrefs.GetInt("SwipeSensitivity", (int)Sensitivity.Medium);
        }

        private void RecalculateThreshold()
        {
            float dpi = Screen.dpi > 0 ? Screen.dpi : 160f;
            float cmToInch = 1f / 2.54f;
            _thresholdPixels = THRESHOLDS_CM[(int)_sensitivity] * cmToInch * dpi;
        }

        private void Update()
        {
#if UNITY_EDITOR
            HandleKeyboard();
#endif
            HandleTouch();
        }

        private void HandleTouch()
        {
            foreach (var touch in Touch.activeTouches)
            {
                if (IsInDeadZone(touch.screenPosition)) continue;

                if (touch.phase == TouchPhase.Began && _trackingFingerId < 0)
                {
                    _trackingFingerId = touch.touchId;
                    _startPos = touch.screenPosition;
                    _startTime = Time.unscaledTime;
                }
                else if (touch.touchId == _trackingFingerId)
                {
                    if (touch.phase == TouchPhase.Moved || touch.phase == TouchPhase.Stationary)
                    {
                        TryDetectSwipe(touch.screenPosition);
                    }
                    else if (touch.phase == TouchPhase.Ended || touch.phase == TouchPhase.Canceled)
                    {
                        TryDetectSwipe(touch.screenPosition);
                        _trackingFingerId = -1;
                    }
                }
            }
        }

        private void TryDetectSwipe(Vector2 currentPos)
        {
            float elapsed = Time.unscaledTime - _startTime;
            if (elapsed > MAX_SWIPE_TIME) return;

            Vector2 delta = currentPos - _startPos;
            float absDx = Mathf.Abs(delta.x);
            float absDy = Mathf.Abs(delta.y);
            float magnitude = Mathf.Max(absDx, absDy);

            if (magnitude < _thresholdPixels) return;

            InputAction action;
            if (absDx > absDy)
            {
                action = delta.x > 0 ? InputAction.LaneRight : InputAction.LaneLeft;
            }
            else
            {
                action = delta.y > 0 ? InputAction.Jump : InputAction.Slide;
            }

            _bufferedAction = action;
            _trackingFingerId = -1;
        }

        private bool IsInDeadZone(Vector2 pos)
        {
            float margin = Screen.width * DEAD_ZONE_PERCENT;
            return pos.x < margin || pos.x > Screen.width - margin;
        }

#if UNITY_EDITOR
        private void HandleKeyboard()
        {
            if (UnityEngine.Input.GetKeyDown(KeyCode.A) || UnityEngine.Input.GetKeyDown(KeyCode.LeftArrow))
                _bufferedAction = InputAction.LaneLeft;
            else if (UnityEngine.Input.GetKeyDown(KeyCode.D) || UnityEngine.Input.GetKeyDown(KeyCode.RightArrow))
                _bufferedAction = InputAction.LaneRight;
            else if (UnityEngine.Input.GetKeyDown(KeyCode.W) || UnityEngine.Input.GetKeyDown(KeyCode.UpArrow))
                _bufferedAction = InputAction.Jump;
            else if (UnityEngine.Input.GetKeyDown(KeyCode.S) || UnityEngine.Input.GetKeyDown(KeyCode.DownArrow))
                _bufferedAction = InputAction.Slide;
        }
#endif
    }
}
