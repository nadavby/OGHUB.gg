// Assets/Scripts/Rendering/CameraController.cs
using UnityEngine;
using NeonRunner.Events;
using NeonRunner.Game;

namespace NeonRunner.Rendering
{
    public sealed class CameraController : MonoBehaviour
    {
        [Header("Follow")]
        [SerializeField] private Transform _target;
        [SerializeField] private Vector3 _offset = new(0f, 4f, -8f);
        [SerializeField] private float _lookDownAngle = 17f;

        [Header("Dynamic FOV")]
        [SerializeField] private Camera _camera;
        [SerializeField] private float _baseFOV = 60f;
        [SerializeField] private float _maxFOV = 72f;

        [Header("Shake")]
        [SerializeField] private float _shakeDamping = 8f;

        private float _currentSpeed;
        private float _maxSpeed;
        private Vector3 _shakeOffset;
        private float _shakeIntensity;

        private void Awake()
        {
            ServiceLocator.Register(this);
            if (_camera == null) _camera = GetComponent<Camera>();
            _maxSpeed = 0.55f;
        }

        private void OnEnable()
        {
            GameEvents.OnHit += HandleHit;
        }

        private void OnDisable()
        {
            GameEvents.OnHit -= HandleHit;
        }

        private void HandleHit(HitArgs _)
        {
            _shakeIntensity = 0.15f;
        }

        public void UpdateCamera(Vector3 targetPosition, float normalizedSpeed)
        {
            _currentSpeed = normalizedSpeed;

            Vector3 desiredPos = targetPosition + _offset;
            transform.position = desiredPos + _shakeOffset;
            transform.rotation = Quaternion.Euler(_lookDownAngle, 0f, 0f);

            float speedT = Mathf.Clamp01(_currentSpeed / _maxSpeed);
            _camera.fieldOfView = Mathf.Lerp(_baseFOV, _maxFOV, speedT);

            if (_shakeIntensity > 0.001f)
            {
                _shakeOffset = Random.insideUnitSphere * _shakeIntensity;
                _shakeOffset.z = 0f;
                _shakeIntensity *= 1f - (_shakeDamping * Time.deltaTime);
            }
            else
            {
                _shakeOffset = Vector3.zero;
                _shakeIntensity = 0f;
            }
        }

        private void OnDestroy()
        {
            ServiceLocator.Unregister<CameraController>();
        }
    }
}
