using UnityEngine;
using NeonRunner.Core;

namespace NeonRunner.Game
{
    /// <summary>
    /// Purely visual component. Translates deterministic state into smooth Unity transforms.
    /// </summary>
    public class RunnerRenderer : MonoBehaviour
    {
        [SerializeField] private Animator _animator;
        [SerializeField] private ParticleSystem _slideSparks;
        [SerializeField] private ParticleSystem _trailGlow;

        private RunnerState _previousState;
        
        // Hashes for Animator parameters
        private static readonly int JumpHash = Animator.StringToHash("Jump");
        private static readonly int SlideHash = Animator.StringToHash("Slide");
        private static readonly int SpeedHash = Animator.StringToHash("Speed");

        public void UpdateVisuals(RunnerState currentState, float alpha)
        {
            // 1. Interpolate Position
            // We interpolate between previous simulation tick and current simulation tick
            // to run smoothly at 144Hz monitors even though simulation is 60Hz.
            Vector3 prevPos = _previousState.Position.ToVector3();
            Vector3 currPos = currentState.Position.ToVector3();
            transform.position = Vector3.Lerp(prevPos, currPos, alpha);

            // 2. Animation States
            _animator.SetFloat(SpeedHash, currentState.Speed.ToFloat() * 10f);

            // Only trigger jump precisely when the state changes
            if (currentState.Vertical == VerticalState.Jumping && _previousState.Vertical != VerticalState.Jumping)
            {
                _animator.SetTrigger(JumpHash);
            }

            // Only trigger slide when state changes
            if (currentState.Vertical == VerticalState.Sliding && _previousState.Vertical != VerticalState.Sliding)
            {
                _animator.SetTrigger(SlideHash);
                _slideSparks.Play();
            }
            else if (currentState.Vertical != VerticalState.Sliding)
            {
                _slideSparks.Stop();
            }

            // VFX: Trial Glow turns intense when combo is high
            var main = _trailGlow.main;
            // E.g., make it brighter based on combo, hooked into SimulationManager snapshop

            _previousState = currentState;
        }
    }
}
