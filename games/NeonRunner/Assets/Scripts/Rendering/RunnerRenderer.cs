// Assets/Scripts/Rendering/RunnerRenderer.cs
using UnityEngine;
using NeonRunner.Core;
using NeonRunner.Events;

namespace NeonRunner.Rendering
{
    public sealed class RunnerRenderer : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private Animator _animator;
        [SerializeField] private Renderer _meshRenderer;

        [Header("Combo Glow")]
        [SerializeField] private Color _baseColor = new(0f, 1f, 1f, 1f);
        [SerializeField] private Color _maxComboColor = new(1f, 0f, 1f, 1f);
        [SerializeField] private float _maxGlowIntensity = 3f;

        private static readonly int JumpHash = Animator.StringToHash("Jump");
        private static readonly int SlideHash = Animator.StringToHash("Slide");
        private static readonly int SpeedHash = Animator.StringToHash("Speed");

        private static readonly int EmissionColorId = Shader.PropertyToID("_EmissionColor");

        private Material _material;
        private RunnerState _previousState;
        private VerticalState _lastVerticalState;

        private void Awake()
        {
            if (_meshRenderer != null)
                _material = _meshRenderer.material;
        }

        public void UpdateVisuals(RunnerState currentState, float alpha)
        {
            float lerpX = Mathf.Lerp(
                (float)_previousState.Position.X,
                (float)currentState.Position.X,
                alpha);
            float lerpY = Mathf.Lerp(
                (float)_previousState.Position.Y,
                (float)currentState.Position.Y,
                alpha);
            float lerpZ = Mathf.Lerp(
                (float)_previousState.Position.Z,
                (float)currentState.Position.Z,
                alpha);

            transform.position = new Vector3(lerpX, lerpY, lerpZ);

            if (_animator != null)
            {
                _animator.SetBool(JumpHash, currentState.Vertical == VerticalState.Jumping);
                _animator.SetBool(SlideHash, currentState.Vertical == VerticalState.Sliding);
                _animator.SetFloat(SpeedHash, (float)currentState.Speed);
            }

            if (currentState.Vertical != _lastVerticalState)
            {
                switch (currentState.Vertical)
                {
                    case VerticalState.Jumping:
                        GameEvents.FireJump();
                        break;
                    case VerticalState.Sliding:
                        GameEvents.FireSlideStart();
                        break;
                    case VerticalState.Running:
                        if (_lastVerticalState == VerticalState.Jumping)
                            GameEvents.FireLand();
                        else if (_lastVerticalState == VerticalState.Sliding)
                            GameEvents.FireSlideEnd();
                        break;
                }
                _lastVerticalState = currentState.Vertical;
            }

            if (currentState.TargetLane != _previousState.TargetLane)
            {
                int dir = currentState.TargetLane > _previousState.TargetLane ? 1 : -1;
                GameEvents.FireLaneSwitch(new LaneSwitchArgs(dir));
            }

            _previousState = currentState;
        }

        public void UpdateComboGlow(int comboCount, float maxCombo)
        {
            if (_material == null) return;
            float t = maxCombo > 0 ? Mathf.Clamp01(comboCount / maxCombo) : 0f;
            Color emissionColor = Color.Lerp(_baseColor, _maxComboColor, t);
            float intensity = Mathf.Lerp(1f, _maxGlowIntensity, t);
            _material.SetColor(EmissionColorId, emissionColor * intensity);
        }

        private void OnDestroy()
        {
            if (_material != null)
                Destroy(_material);
        }
    }
}
