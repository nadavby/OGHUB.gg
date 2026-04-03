// Assets/Scripts/Game/ObjectPool.cs
using System.Collections.Generic;
using UnityEngine;
using NeonRunner.Core;

namespace NeonRunner.Game
{
    public sealed class ObjectPool : MonoBehaviour
    {
        [Header("Obstacle Prefabs")]
        [SerializeField] private GameObject _lowBarrierPrefab;
        [SerializeField] private GameObject _highBarrierPrefab;
        [SerializeField] private GameObject _fullBlockPrefab;
        [SerializeField] private GameObject _skillGatePrefab;
        [SerializeField] private GameObject _riskTunnelPrefab;

        private readonly Dictionary<ObstacleType, Queue<GameObject>> _pools = new();

        private void Awake()
        {
            ServiceLocator.Register(this);
            _pools[ObstacleType.LowBarrier] = new Queue<GameObject>();
            _pools[ObstacleType.HighBarrier] = new Queue<GameObject>();
            _pools[ObstacleType.FullBlock] = new Queue<GameObject>();
            _pools[ObstacleType.SkillGate] = new Queue<GameObject>();
            _pools[ObstacleType.RiskTunnel] = new Queue<GameObject>();
        }

        public GameObject Get(ObstacleType type)
        {
            if (_pools[type].Count > 0)
            {
                var obj = _pools[type].Dequeue();
                obj.SetActive(true);
                return obj;
            }

            var prefab = GetPrefab(type);
            if (prefab == null) return null;

            var instance = Instantiate(prefab, transform);
            instance.name = $"{type}_{instance.GetInstanceID()}";
            return instance;
        }

        public void Return(GameObject obj, ObstacleType type)
        {
            if (obj == null) return;
            obj.SetActive(false);
            obj.transform.SetParent(transform);
            _pools[type].Enqueue(obj);
        }

        private GameObject GetPrefab(ObstacleType type)
        {
            return type switch
            {
                ObstacleType.LowBarrier => _lowBarrierPrefab,
                ObstacleType.HighBarrier => _highBarrierPrefab,
                ObstacleType.FullBlock => _fullBlockPrefab,
                ObstacleType.SkillGate => _skillGatePrefab,
                ObstacleType.RiskTunnel => _riskTunnelPrefab,
                _ => _fullBlockPrefab
            };
        }

        private void OnDestroy()
        {
            ServiceLocator.Unregister<ObjectPool>();
        }
    }
}
