// Assets/Scripts/SDK/OGHubBridge.cs
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;
using NeonRunner.Core;
using NeonRunner.Game;
using OGHub;

namespace NeonRunner.SDK
{
    public sealed class OGHubBridge : MonoBehaviour
    {
        [SerializeField] private string _apiKey = "";
        [SerializeField] private string _apiSecret = "";
        [SerializeField] private string _apiEndpoint = "http://10.0.0.24:3001/api";

        public bool IsCompetitive { get; private set; }
        public OGHubSession Session { get; private set; }
        public GameConfig CurrentConfig { get; private set; } = GameConfig.Default;

        /// <summary>
        /// Set by GameManager to provide live validation snapshot data.
        /// </summary>
        public Func<Dictionary<string, object>> ValidationSnapshotProvider { get; set; }

        private void Awake()
        {
            ServiceLocator.Register(this);
            DontDestroyOnLoad(gameObject);
            Application.deepLinkActivated += OnDeepLinkActivated;
        }

        private void Start()
        {
            if (!string.IsNullOrEmpty(Application.absoluteURL))
                OnDeepLinkActivated(Application.absoluteURL);
        }

        private async void OnDeepLinkActivated(string url)
        {
            Debug.Log($"[OGHubBridge] Deep link: {url}");
            try
            {
                var uri = new Uri(url);
                var q = ParseQuery(uri.Query);

                string challengeId = q.GetValueOrDefault("challengeId");
                if (string.IsNullOrEmpty(challengeId)) return;

                await OGHubSDK.Init(new OGHubConfig
                {
                    apiKey = _apiKey,
                    apiSecret = _apiSecret,
                    gameSlug = "neon-runner",
                    apiUrl = _apiEndpoint,
                });

                Session = await OGHubSDK.CreateSession(challengeId);
                IsCompetitive = true;

                // Set up live validation — uses provider callback set by GameManager
                OGHubSDK.OnValidationRequest(() =>
                {
                    if (ValidationSnapshotProvider != null)
                        return ValidationSnapshotProvider();
                    return new Dictionary<string, object>();
                });

                // Parse seed into game config
                if (long.TryParse(Session.seed, out long seed))
                {
                    CurrentConfig = new GameConfig
                    {
                        Seed = seed,
                        Modifiers = GameModifiers.None,
                        StartingLives = 3,
                        TimeLimitSeconds = Fixed.Zero,
                    };
                }

                var scene = ServiceLocator.Get<SceneController>();
                scene?.LoadScene("GameplayScene");
            }
            catch (Exception e)
            {
                Debug.LogError($"[OGHubBridge] Deep link failed: {e.Message}");
            }
        }

        public void StartGameplay()
        {
            if (!IsCompetitive) return;
            OGHubSDK.StartSession();
        }

        public void ReportInput(InputAction action)
        {
            if (!IsCompetitive) return;
            string name = action switch
            {
                InputAction.LaneLeft => "lane_left",
                InputAction.LaneRight => "lane_right",
                InputAction.Jump => "jump",
                InputAction.Slide => "slide",
                _ => "none",
            };
            OGHubSDK.ReportInput(name);
        }

        public void UpdateScore(int score)
        {
            if (!IsCompetitive) return;
            OGHubSDK.UpdateScore(score);
        }

        public async Task<OGHubSessionResult> SubmitFinalScore()
        {
            if (!IsCompetitive) return null;
            var result = await OGHubSDK.EndSession();
            IsCompetitive = false;
            Session = null;
            return result;
        }

        public void Reset()
        {
            IsCompetitive = false;
            Session = null;
            CurrentConfig = GameConfig.Default;
            ValidationSnapshotProvider = null;
        }

        private Dictionary<string, string> ParseQuery(string query)
        {
            var result = new Dictionary<string, string>();
            if (string.IsNullOrEmpty(query)) return result;
            query = query.TrimStart('?');
            foreach (var pair in query.Split('&'))
            {
                var kv = pair.Split('=');
                if (kv.Length == 2)
                    result[Uri.UnescapeDataString(kv[0])] = Uri.UnescapeDataString(kv[1]);
            }
            return result;
        }

        private void OnDestroy()
        {
            Application.deepLinkActivated -= OnDeepLinkActivated;
            ServiceLocator.Unregister<OGHubBridge>();
        }
    }

    // Kept for backward compatibility with ResultsScreenUI
    public class GhostData
    {
        public long Seed;
        public List<TickInput> Inputs;
        public int Duration;
        public string PlayerName;
        public int Score;
    }

    [Serializable]
    public class SessionOutcome
    {
        public bool accepted;
        public int score;
        public int rank;
        public NearMissInfo nearMiss;
    }

    [Serializable]
    public class NearMissInfo
    {
        public string message;
        public int targetRank;
        public int targetScore;
        public int difference;
        public float percentile;
    }
}
