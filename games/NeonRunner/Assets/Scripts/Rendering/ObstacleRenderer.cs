// Assets/Scripts/Rendering/ObstacleRenderer.cs
using System.Collections.Generic;
using UnityEngine;
using NeonRunner.Core;
using NeonRunner.Game;

namespace NeonRunner.Rendering
{
    public sealed class ObstacleRenderer : MonoBehaviour
    {
        private readonly Dictionary<int, GameObject> _activeVisuals = new();
        private readonly List<int> _staleKeysBuffer = new();

        public void UpdateObstacles(IReadOnlyList<ObstacleData> obstacles)
        {
            _staleKeysBuffer.Clear();
            foreach (var kvp in _activeVisuals)
                _staleKeysBuffer.Add(kvp.Key);

            for (int i = 0; i < obstacles.Count; i++)
            {
                var obs = obstacles[i];
                if (!obs.IsActive) continue;

                _staleKeysBuffer.Remove(obs.Id);

                if (!_activeVisuals.TryGetValue(obs.Id, out var visual))
                {
                    var pool = ServiceLocator.Get<ObjectPool>();
                    if (pool == null) continue;
                    visual = pool.Get(obs.Type);
                    _activeVisuals[obs.Id] = visual;
                }

                visual.transform.position = new Vector3(
                    (float)obs.Position.X,
                    (float)obs.Position.Y,
                    (float)obs.Position.Z
                );
            }

            for (int i = 0; i < _staleKeysBuffer.Count; i++)
            {
                int id = _staleKeysBuffer[i];
                if (_activeVisuals.TryGetValue(id, out var visual))
                {
                    var pool = ServiceLocator.Get<ObjectPool>();
                    pool?.Return(visual, GetObstacleType(visual));
                    _activeVisuals.Remove(id);
                }
            }
        }

        private ObstacleType GetObstacleType(GameObject obj)
        {
            if (obj.name.StartsWith("LowBarrier")) return ObstacleType.LowBarrier;
            if (obj.name.StartsWith("HighBarrier")) return ObstacleType.HighBarrier;
            if (obj.name.StartsWith("FullBlock")) return ObstacleType.FullBlock;
            if (obj.name.StartsWith("SkillGate")) return ObstacleType.SkillGate;
            if (obj.name.StartsWith("RiskTunnel")) return ObstacleType.RiskTunnel;
            return ObstacleType.FullBlock;
        }

        public void ClearAll()
        {
            var pool = ServiceLocator.Get<ObjectPool>();
            foreach (var kvp in _activeVisuals)
            {
                pool?.Return(kvp.Value, GetObstacleType(kvp.Value));
            }
            _activeVisuals.Clear();
        }
    }
}
