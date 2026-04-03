// Assets/Scripts/VFX/VFXManager.cs
using System.Collections.Generic;
using UnityEngine;
using NeonRunner.Events;
using NeonRunner.Game;

namespace NeonRunner.VFX
{
    public sealed class VFXManager : MonoBehaviour
    {
        [Header("Prefabs")]
        [SerializeField] private ParticleSystem _laneSwitchPrefab;
        [SerializeField] private ParticleSystem _jumpBurstPrefab;
        [SerializeField] private ParticleSystem _landBurstPrefab;
        [SerializeField] private ParticleSystem _slideSparksLoopPrefab;
        [SerializeField] private ParticleSystem _nearMissFlashPrefab;
        [SerializeField] private ParticleSystem _perfectDodgeBurstPrefab;
        [SerializeField] private ParticleSystem _hitShatterPrefab;
        [SerializeField] private ParticleSystem _comboShockwavePrefab;
        [SerializeField] private ParticleSystem _backgroundEmbersPrefab;

        [Header("Runner Reference")]
        [SerializeField] private Transform _runnerTransform;

        private const int POOL_SIZE_PER_TYPE = 8;

        private readonly Dictionary<ParticleSystem, Queue<ParticleSystem>> _pools = new();
        private ParticleSystem _activeSlideSparks;
        private ParticleSystem _activeBackgroundEmbers;

        private void Awake()
        {
            ServiceLocator.Register(this);
        }

        private void Start()
        {
            if (_backgroundEmbersPrefab != null)
            {
                _activeBackgroundEmbers = GetFromPool(_backgroundEmbersPrefab);
                _activeBackgroundEmbers.transform.position = Vector3.zero;
                _activeBackgroundEmbers.Play();
            }
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
        }

        private void HandleLaneSwitch(LaneSwitchArgs args)
        {
            if (_laneSwitchPrefab == null || _runnerTransform == null) return;
            var ps = GetFromPool(_laneSwitchPrefab);
            ps.transform.position = _runnerTransform.position;
            var rot = args.Direction > 0 ? Quaternion.Euler(0, 90, 0) : Quaternion.Euler(0, -90, 0);
            ps.transform.rotation = rot;
            ps.Play();
        }

        private void HandleJump() => PlayAtRunner(_jumpBurstPrefab);
        private void HandleLand() => PlayAtRunner(_landBurstPrefab);

        private void HandleSlideStart()
        {
            if (_slideSparksLoopPrefab == null || _runnerTransform == null) return;
            _activeSlideSparks = GetFromPool(_slideSparksLoopPrefab);
            _activeSlideSparks.transform.SetParent(_runnerTransform);
            _activeSlideSparks.transform.localPosition = new Vector3(0, 0.05f, 0);
            _activeSlideSparks.Play();
        }

        private void HandleSlideEnd()
        {
            if (_activeSlideSparks != null)
            {
                _activeSlideSparks.Stop();
                _activeSlideSparks.transform.SetParent(transform);
                _activeSlideSparks = null;
            }
        }

        private void HandleNearMiss(NearMissArgs args)
        {
            var prefab = args.IsPerfect ? _perfectDodgeBurstPrefab : _nearMissFlashPrefab;
            PlayAtRunner(prefab);
        }

        private void HandleHit(HitArgs _) => PlayAtRunner(_hitShatterPrefab);
        private void HandleComboMilestone(int _) => PlayAtRunner(_comboShockwavePrefab);

        private void PlayAtRunner(ParticleSystem prefab)
        {
            if (prefab == null || _runnerTransform == null) return;
            var ps = GetFromPool(prefab);
            ps.transform.position = _runnerTransform.position;
            ps.Play();
        }

        private ParticleSystem GetFromPool(ParticleSystem prefab)
        {
            if (!_pools.TryGetValue(prefab, out var queue))
            {
                queue = new Queue<ParticleSystem>();
                _pools[prefab] = queue;
            }

            int count = queue.Count;
            for (int i = 0; i < count; i++)
            {
                var candidate = queue.Dequeue();
                if (!candidate.isPlaying)
                {
                    queue.Enqueue(candidate);
                    return candidate;
                }
                queue.Enqueue(candidate);
            }

            if (count < POOL_SIZE_PER_TYPE)
            {
                var instance = Instantiate(prefab, transform);
                instance.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
                queue.Enqueue(instance);
                return instance;
            }

            var stolen = queue.Dequeue();
            stolen.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            queue.Enqueue(stolen);
            return stolen;
        }

        private void OnDestroy()
        {
            ServiceLocator.Unregister<VFXManager>();
        }
    }
}
