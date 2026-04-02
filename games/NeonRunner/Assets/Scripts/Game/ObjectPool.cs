using System.Collections.Generic;
using UnityEngine;
using NeonRunner.Core;

namespace NeonRunner.Game
{
    /// <summary>
    /// Simple visual object pool for mobile performance.
    /// Does NOT affect simulation determinism.
    /// </summary>
    public class ObjectPool : MonoBehaviour
    {
        public static ObjectPool Instance { get; private set; }

        [SerializeField] private GameObject _lowBarrierPrefab;
        [SerializeField] private GameObject _highBarrierPrefab;
        [SerializeField] private GameObject _fullBlockPrefab;
        [SerializeField] private GameObject _skillGatePrefab;
        [SerializeField] private GameObject _riskTunnelPrefab;

        private readonly Dictionary<ObstacleType, Queue<GameObject>> _pools = new Dictionary<ObstacleType, Queue<GameObject>>();

        private void Awake()
        {
            Instance = this;

            _pools[ObstacleType.LowBarrier] = new Queue<GameObject>();
            _pools[ObstacleType.HighBarrier] = new Queue<GameObject>();
            _pools[ObstacleType.FullBlock] = new Queue<GameObject>();
            _pools[ObstacleType.SkillGate] = new Queue<GameObject>();
            _pools[ObstacleType.RiskTunnel] = new Queue<GameObject>();
        }

        public GameObject Get(ObstacleType type)
        {
            if (_pools.TryGetValue(type, out Queue<GameObject> queue) && queue.Count > 0)
            {
                var obj = queue.Dequeue();
                obj.SetActive(true);
                return obj;
            }

            // Instantiate new if pool empty
            GameObject prefab = GetPrefab(type);
            var newObj = Instantiate(prefab, transform);
            return newObj;
        }

        public void Return(GameObject obj, ObstacleType type)
        {
            obj.SetActive(false);
            if (_pools.TryGetValue(type, out Queue<GameObject> queue))
            {
                queue.Enqueue(obj);
            }
        }

        private GameObject GetPrefab(ObstacleType type)
        {
            switch (type)
            {
                case ObstacleType.LowBarrier: return _lowBarrierPrefab;
                case ObstacleType.HighBarrier: return _highBarrierPrefab;
                case ObstacleType.SkillGate: return _skillGatePrefab;
                case ObstacleType.RiskTunnel: return _riskTunnelPrefab;
                default: return _fullBlockPrefab;
            }
        }
    }
}
