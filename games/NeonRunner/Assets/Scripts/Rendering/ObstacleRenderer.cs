using System.Collections.Generic;
using UnityEngine;
using NeonRunner.Core;

namespace NeonRunner.Rendering
{
    /// <summary>
    /// Renders obstacles dynamically based on the pure simulation data.
    /// Pulls from ObjectPool. Uses pure interpolation just like RunnerRenderer.
    /// </summary>
    public class ObstacleRenderer : MonoBehaviour
    {
        private class VisualObstacle
        {
            public int LogicId;
            public ObstacleType Type;
            public GameObject VisualObj;
        }

        private readonly Dictionary<int, VisualObstacle> _activeVisuals = new Dictionary<int, VisualObstacle>();
        private readonly List<int> _staleKeysBuffer = new List<int>(); // No GC alloc

        private void LateUpdate()
        {
            if (Game.GameManager.Instance == null) return;
            
            var obstacles = Game.GameManager.Instance.GetActiveObstacles();

            // 1. Mark all as stale, then we'll remove ones that are active
            _staleKeysBuffer.Clear();
            _staleKeysBuffer.AddRange(_activeVisuals.Keys);

            // 2. Add new or update existing
            for (int i = 0; i < obstacles.Count; i++)
            {
                var simObs = obstacles[i];
                if (!simObs.IsActive) continue;

                if (_activeVisuals.TryGetValue(simObs.Id, out VisualObstacle vo))
                {
                    _staleKeysBuffer.Remove(simObs.Id);
                    
                    // Simple position update (no lerp here since obstacles don't move in Z, 
                    // only runner moves! But if they did, we would lerp).
                    vo.VisualObj.transform.position = simObs.Position.ToVector3();
                }
                else
                {
                    // Spawn new visual
                    var go = Game.ObjectPool.Instance.Get(simObs.Type);
                    go.transform.position = simObs.Position.ToVector3();
                    // Optional: set custom material colors dynamically for risk tunnels etc.
                    
                    _activeVisuals[simObs.Id] = new VisualObstacle
                    {
                        LogicId = simObs.Id,
                        Type = simObs.Type,
                        VisualObj = go
                    };
                }
            }

            // 3. Return stale (despawned) to pool
            foreach (int id in _staleKeysBuffer)
            {
                var vo = _activeVisuals[id];
                Game.ObjectPool.Instance.Return(vo.VisualObj, vo.Type);
                _activeVisuals.Remove(id);
            }
        }
    }
}
