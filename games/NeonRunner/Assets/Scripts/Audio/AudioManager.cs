// Assets/Scripts/Audio/AudioManager.cs
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Audio;
using NeonRunner.Events;
using NeonRunner.Game;

namespace NeonRunner.Audio
{
    public sealed class AudioManager : MonoBehaviour
    {
        [Header("Mixer")]
        [SerializeField] private AudioMixerGroup _musicGroup;
        [SerializeField] private AudioMixerGroup _sfxGroup;
        [SerializeField] private AudioMixerGroup _uiGroup;
        [SerializeField] private AudioMixer _mixer;

        [Header("Music")]
        [SerializeField] private AudioClip _gameplayMusic;
        [SerializeField] private AudioClip _menuMusic;

        [Header("SFX")]
        [SerializeField] private AudioClip _sfxLaneSwitch;
        [SerializeField] private AudioClip _sfxJump;
        [SerializeField] private AudioClip _sfxLand;
        [SerializeField] private AudioClip _sfxSlide;
        [SerializeField] private AudioClip _sfxNearMiss;
        [SerializeField] private AudioClip _sfxPerfectDodge;
        [SerializeField] private AudioClip _sfxComboMilestone;
        [SerializeField] private AudioClip _sfxHit;
        [SerializeField] private AudioClip _sfxSkillGate;
        [SerializeField] private AudioClip _sfxGameOver;
        [SerializeField] private AudioClip _sfxCountdownTick;
        [SerializeField] private AudioClip _sfxCountdownGo;
        [SerializeField] private AudioClip _sfxUIClick;

        private AudioSource _musicSourceA;
        private AudioSource _musicSourceB;
        private AudioSource _slideLoopSource;
        private AudioSource _uiSource;
        private AudioSource[] _sfxPool;
        private int _sfxPoolIndex;

        private const int SFX_POOL_SIZE = 4;
        private const float CROSSFADE_DURATION = 1f;

        private void Awake()
        {
            ServiceLocator.Register(this);
            DontDestroyOnLoad(gameObject);
            CreateAudioSources();
            LoadVolumes();
        }

        private void CreateAudioSources()
        {
            _musicSourceA = CreateSource("MusicA", _musicGroup, true);
            _musicSourceB = CreateSource("MusicB", _musicGroup, true);
            _musicSourceB.volume = 0f;

            _slideLoopSource = CreateSource("SlideLoop", _sfxGroup, true);
            _slideLoopSource.volume = 0f;

            _uiSource = CreateSource("UI", _uiGroup, false);

            _sfxPool = new AudioSource[SFX_POOL_SIZE];
            for (int i = 0; i < SFX_POOL_SIZE; i++)
                _sfxPool[i] = CreateSource($"SFX_{i}", _sfxGroup, false);
        }

        private AudioSource CreateSource(string name, AudioMixerGroup group, bool loop)
        {
            var go = new GameObject($"AudioSrc_{name}");
            go.transform.SetParent(transform);
            var src = go.AddComponent<AudioSource>();
            src.outputAudioMixerGroup = group;
            src.loop = loop;
            src.playOnAwake = false;
            return src;
        }

        private void OnEnable()
        {
            GameEvents.OnLaneSwitch += HandleLaneSwitch;
            GameEvents.OnJump += HandleJump;
            GameEvents.OnLand += HandleLand;
            GameEvents.OnSlideStart += HandleSlideStart;
            GameEvents.OnSlideEnd += HandleSlideEnd;
            GameEvents.OnNearMiss += HandleNearMiss;
            GameEvents.OnHit += HandleHit;
            GameEvents.OnComboMilestone += HandleComboMilestone;
            GameEvents.OnGameOver += HandleGameOver;
            GameEvents.OnCountdownTick += HandleCountdownTick;
            GameEvents.OnCountdownGo += HandleCountdownGo;
        }

        private void OnDisable()
        {
            GameEvents.OnLaneSwitch -= HandleLaneSwitch;
            GameEvents.OnJump -= HandleJump;
            GameEvents.OnLand -= HandleLand;
            GameEvents.OnSlideStart -= HandleSlideStart;
            GameEvents.OnSlideEnd -= HandleSlideEnd;
            GameEvents.OnNearMiss -= HandleNearMiss;
            GameEvents.OnHit -= HandleHit;
            GameEvents.OnComboMilestone -= HandleComboMilestone;
            GameEvents.OnGameOver -= HandleGameOver;
            GameEvents.OnCountdownTick -= HandleCountdownTick;
            GameEvents.OnCountdownGo -= HandleCountdownGo;
        }

        public void PlayMusic(bool isGameplay)
        {
            var clip = isGameplay ? _gameplayMusic : _menuMusic;
            if (clip == null) return;
            StartCoroutine(CrossfadeMusic(clip));
        }

        public void StopMusic(float fadeDuration = 1f)
        {
            StartCoroutine(FadeOutMusic(fadeDuration));
        }

        private IEnumerator CrossfadeMusic(AudioClip newClip)
        {
            _musicSourceB.clip = newClip;
            _musicSourceB.Play();

            float elapsed = 0f;
            float startVolA = _musicSourceA.volume;
            while (elapsed < CROSSFADE_DURATION)
            {
                elapsed += Time.unscaledDeltaTime;
                float t = elapsed / CROSSFADE_DURATION;
                _musicSourceA.volume = Mathf.Lerp(startVolA, 0f, t);
                _musicSourceB.volume = Mathf.Lerp(0f, 1f, t);
                yield return null;
            }

            _musicSourceA.Stop();
            _musicSourceA.volume = 0f;
            (_musicSourceA, _musicSourceB) = (_musicSourceB, _musicSourceA);
        }

        private IEnumerator FadeOutMusic(float duration)
        {
            float startVol = _musicSourceA.volume;
            float elapsed = 0f;
            while (elapsed < duration)
            {
                elapsed += Time.unscaledDeltaTime;
                _musicSourceA.volume = Mathf.Lerp(startVol, 0f, elapsed / duration);
                yield return null;
            }
            _musicSourceA.Stop();
        }

        private void PlaySFX(AudioClip clip, float pan = 0f)
        {
            if (clip == null) return;
            var src = _sfxPool[_sfxPoolIndex];
            _sfxPoolIndex = (_sfxPoolIndex + 1) % SFX_POOL_SIZE;
            src.panStereo = pan;
            src.PlayOneShot(clip);
        }

        public void PlayUIClick()
        {
            if (_sfxUIClick != null)
                _uiSource.PlayOneShot(_sfxUIClick);
        }

        private void HandleLaneSwitch(LaneSwitchArgs args) =>
            PlaySFX(_sfxLaneSwitch, args.Direction * 0.3f);

        private void HandleJump() => PlaySFX(_sfxJump);
        private void HandleLand() => PlaySFX(_sfxLand);

        private void HandleSlideStart()
        {
            if (_sfxSlide == null) return;
            _slideLoopSource.clip = _sfxSlide;
            _slideLoopSource.volume = 1f;
            _slideLoopSource.Play();
        }

        private void HandleSlideEnd()
        {
            _slideLoopSource.volume = 0f;
            _slideLoopSource.Stop();
        }

        private void HandleNearMiss(NearMissArgs args) =>
            PlaySFX(args.IsPerfect ? _sfxPerfectDodge : _sfxNearMiss);

        private void HandleHit(HitArgs _) => PlaySFX(_sfxHit);
        private void HandleComboMilestone(int _) => PlaySFX(_sfxComboMilestone);
        private void HandleGameOver(GameOverArgs _) => PlaySFX(_sfxGameOver);
        private void HandleCountdownTick() => PlaySFX(_sfxCountdownTick);
        private void HandleCountdownGo() => PlaySFX(_sfxCountdownGo);

        public void SetMusicVolume(float normalized)
        {
            float db = normalized > 0.001f ? Mathf.Log10(normalized) * 20f : -80f;
            _mixer.SetFloat("MusicVolume", db);
            PlayerPrefs.SetFloat("MusicVolume", normalized);
        }

        public void SetSFXVolume(float normalized)
        {
            float db = normalized > 0.001f ? Mathf.Log10(normalized) * 20f : -80f;
            _mixer.SetFloat("SFXVolume", db);
            PlayerPrefs.SetFloat("SFXVolume", normalized);
        }

        public float GetMusicVolume() => PlayerPrefs.GetFloat("MusicVolume", 0.8f);
        public float GetSFXVolume() => PlayerPrefs.GetFloat("SFXVolume", 0.8f);

        private void LoadVolumes()
        {
            SetMusicVolume(GetMusicVolume());
            SetSFXVolume(GetSFXVolume());
        }

        private void OnDestroy()
        {
            ServiceLocator.Unregister<AudioManager>();
        }
    }
}
