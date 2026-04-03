// Assets/Scripts/Rendering/EnvironmentRenderer.cs
using UnityEngine;
using NeonRunner.Game;

namespace NeonRunner.Rendering
{
    public sealed class EnvironmentRenderer : MonoBehaviour
    {
        [Header("Grid")]
        [SerializeField] private Renderer _gridRenderer;
        [SerializeField] private float _gridScrollMultiplier = 1f;

        [Header("Fog")]
        [SerializeField] private ParticleSystem _edgeFog;

        private Material _gridMaterial;
        private float _scrollOffset;

        private static readonly int ScrollOffsetId = Shader.PropertyToID("_ScrollOffset");
        private static readonly int PulseIntensityId = Shader.PropertyToID("_PulseIntensity");

        private void Awake()
        {
            ServiceLocator.Register(this);
            if (_gridRenderer != null)
                _gridMaterial = _gridRenderer.material;
        }

        public void UpdateEnvironment(float speed, float deltaTime)
        {
            if (_gridMaterial == null) return;

            _scrollOffset += speed * _gridScrollMultiplier * deltaTime;
            _gridMaterial.SetFloat(ScrollOffsetId, _scrollOffset);
        }

        public void SetPulseEnabled(bool enabled)
        {
            if (_gridMaterial != null)
                _gridMaterial.SetFloat(PulseIntensityId, enabled ? 1f : 0f);
        }

        private void OnDestroy()
        {
            if (_gridMaterial != null)
                Destroy(_gridMaterial);
            ServiceLocator.Unregister<EnvironmentRenderer>();
        }
    }
}
