// Assets/Scripts/VFX/ScreenEffects.cs
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using NeonRunner.Events;
using NeonRunner.Game;

namespace NeonRunner.VFX
{
    public sealed class ScreenEffects : MonoBehaviour
    {
        [SerializeField] private Volume _postProcessVolume;

        private Vignette _vignette;
        private ChromaticAberration _chromaticAberration;
        private Bloom _bloom;

        private float _baseVignetteIntensity = 0.25f;
        private float _baseChromaticIntensity = 0.05f;

        private float _hitFlashTimer;
        private float _nearMissFlashTimer;

        private const float HIT_FLASH_DURATION = 0.3f;
        private const float NEAR_MISS_FLASH_DURATION = 0.15f;

        private void Awake()
        {
            ServiceLocator.Register(this);

            if (_postProcessVolume != null && _postProcessVolume.profile != null)
            {
                _postProcessVolume.profile.TryGet(out _vignette);
                _postProcessVolume.profile.TryGet(out _chromaticAberration);
                _postProcessVolume.profile.TryGet(out _bloom);
            }
        }

        private void OnEnable()
        {
            GameEvents.OnHit += HandleHit;
            GameEvents.OnNearMiss += HandleNearMiss;
        }

        private void OnDisable()
        {
            GameEvents.OnHit -= HandleHit;
            GameEvents.OnNearMiss -= HandleNearMiss;
        }

        private void HandleHit(HitArgs _)
        {
            _hitFlashTimer = HIT_FLASH_DURATION;
        }

        private void HandleNearMiss(NearMissArgs args)
        {
            _nearMissFlashTimer = NEAR_MISS_FLASH_DURATION;
        }

        private void Update()
        {
            if (_hitFlashTimer > 0f)
            {
                _hitFlashTimer -= Time.deltaTime;
                float t = Mathf.Clamp01(_hitFlashTimer / HIT_FLASH_DURATION);
                if (_vignette != null)
                {
                    _vignette.intensity.value = Mathf.Lerp(_baseVignetteIntensity, 0.6f, t);
                    _vignette.color.value = Color.Lerp(Color.black, new Color(1f, 0f, 0f, 1f), t);
                }
                if (_chromaticAberration != null)
                    _chromaticAberration.intensity.value = Mathf.Lerp(_baseChromaticIntensity, 0.5f, t);
            }
            else if (_nearMissFlashTimer > 0f)
            {
                _nearMissFlashTimer -= Time.deltaTime;
                float t = Mathf.Clamp01(_nearMissFlashTimer / NEAR_MISS_FLASH_DURATION);
                if (_chromaticAberration != null)
                    _chromaticAberration.intensity.value = Mathf.Lerp(_baseChromaticIntensity, 0.25f, t);
            }
            else
            {
                if (_vignette != null)
                {
                    _vignette.intensity.value = _baseVignetteIntensity;
                    _vignette.color.value = Color.black;
                }
                if (_chromaticAberration != null)
                    _chromaticAberration.intensity.value = _baseChromaticIntensity;
            }
        }

        public void SetPhaseVignette(float intensity)
        {
            _baseVignetteIntensity = intensity;
        }

        public void ApplyQualityTier(int tier)
        {
            if (_chromaticAberration != null)
                _chromaticAberration.active = tier >= 2;
            if (_vignette != null)
                _vignette.active = tier >= 1;
        }

        private void OnDestroy()
        {
            ServiceLocator.Unregister<ScreenEffects>();
        }
    }
}
