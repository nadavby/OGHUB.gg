// Assets/Scripts/Game/ServiceLocator.cs
using System;
using System.Collections.Generic;
using UnityEngine;

namespace NeonRunner.Game
{
    public sealed class ServiceLocator : MonoBehaviour
    {
        private static ServiceLocator _instance;
        private readonly Dictionary<Type, object> _services = new();

        private void Awake()
        {
            if (_instance != null && _instance != this)
            {
                Destroy(gameObject);
                return;
            }
            _instance = this;
            DontDestroyOnLoad(gameObject);
        }

        public static void Register<T>(T service) where T : class
        {
            if (_instance == null)
            {
                Debug.LogError($"[ServiceLocator] No instance. Cannot register {typeof(T).Name}");
                return;
            }
            _instance._services[typeof(T)] = service;
        }

        public static T Get<T>() where T : class
        {
            if (_instance == null || !_instance._services.TryGetValue(typeof(T), out var service))
            {
                Debug.LogError($"[ServiceLocator] Service {typeof(T).Name} not registered");
                return null;
            }
            return (T)service;
        }

        public static bool TryGet<T>(out T service) where T : class
        {
            service = null;
            if (_instance == null || !_instance._services.TryGetValue(typeof(T), out var obj))
                return false;
            service = (T)obj;
            return true;
        }

        public static void Unregister<T>() where T : class
        {
            if (_instance != null)
                _instance._services.Remove(typeof(T));
        }

        private void OnDestroy()
        {
            if (_instance == this)
            {
                _services.Clear();
                _instance = null;
            }
        }
    }
}
