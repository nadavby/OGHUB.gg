// Assets/Scripts/SDK/OGHubBridge.cs
using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;
using NeonRunner.Core;
using NeonRunner.Game;

namespace NeonRunner.SDK
{
    public enum SessionState
    {
        Idle,
        Validating,
        Ready,
        InProgress,
        Submitting,
        Done,
        Failed
    }

    public sealed class OGHubBridge : MonoBehaviour
    {
        [SerializeField] private string _gameId = "neon-runner";
        [SerializeField] private string _apiEndpoint = "http://localhost:3001/api";

        public SessionState State { get; private set; } = SessionState.Idle;
        public string SessionId { get; private set; }
        public string SessionToken { get; private set; }
        public string ChallengeId { get; private set; }
        public GameConfig CurrentConfig { get; private set; }
        public bool IsCompetitive => !string.IsNullOrEmpty(SessionId);

        public GhostData LoadedGhost { get; private set; }

        private const int VALIDATE_RETRIES = 3;
        private const int SUBMIT_RETRIES = 5;
        private const float HTTP_TIMEOUT = 10f;

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

            RetryCachedSubmission();
        }

        private void OnDeepLinkActivated(string url)
        {
            Debug.Log($"[OGHubBridge] Deep link: {url}");
            try
            {
                var uri = new Uri(url);
                var queryParams = ParseQuery(uri.Query);

                string token = queryParams.GetValueOrDefault("token");
                string seed = queryParams.GetValueOrDefault("seed");
                string sessionId = queryParams.GetValueOrDefault("sessionId");

                if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(seed) || string.IsNullOrEmpty(sessionId))
                {
                    Debug.LogError("[OGHubBridge] Missing required deep link params");
                    return;
                }

                SessionToken = token;
                SessionId = sessionId;
                ChallengeId = queryParams.GetValueOrDefault("challengeId");

                int lives = 3;
                if (queryParams.TryGetValue("lives", out var livesStr) && int.TryParse(livesStr, out var parsedLives))
                    lives = parsedLives;

                GameModifiers modifiers = GameModifiers.None;
                if (queryParams.TryGetValue("modifiers", out var modStr) && ushort.TryParse(modStr, out var modVal))
                    modifiers = (GameModifiers)modVal;

                CurrentConfig = new GameConfig
                {
                    Seed = long.Parse(seed),
                    Modifiers = modifiers,
                    StartingLives = lives,
                    TimeLimitSeconds = Fixed.Zero
                };

                var scene = ServiceLocator.Get<SceneController>();
                scene?.LoadScene("GameplayScene");
            }
            catch (Exception e)
            {
                Debug.LogError($"[OGHubBridge] Failed to parse deep link: {e.Message}");
            }
        }

        public async Task<bool> ValidateSession()
        {
            if (State != SessionState.Idle) return false;
            State = SessionState.Validating;

            for (int attempt = 0; attempt < VALIDATE_RETRIES; attempt++)
            {
                try
                {
                    string url = $"{_apiEndpoint}/sessions/{SessionId}/validate";
                    string body = JsonUtility.ToJson(new ValidatePayload { gameId = _gameId });
                    string response = await PostRequest(url, body);

                    if (response != null)
                    {
                        var result = JsonUtility.FromJson<ValidateResponse>(response);
                        if (result.ghostData != null && result.ghostData.inputTimeline != null)
                        {
                            LoadedGhost = ParseGhostData(result.ghostData);
                        }

                        State = SessionState.Ready;
                        return true;
                    }
                }
                catch (Exception e)
                {
                    Debug.LogWarning($"[OGHubBridge] Validate attempt {attempt + 1} failed: {e.Message}");
                }

                if (attempt < VALIDATE_RETRIES - 1)
                {
                    float delay = Mathf.Pow(2, attempt);
                    await Task.Delay((int)(delay * 1000));
                }
            }

            State = SessionState.Failed;
            return false;
        }

        public void MarkInProgress()
        {
            if (State == SessionState.Ready)
                State = SessionState.InProgress;
        }

        public async Task<SessionOutcome> SubmitScore(ReplayData replayData)
        {
            if (State != SessionState.InProgress && State != SessionState.Ready)
                return null;

            State = SessionState.Submitting;

            var payload = new EndSessionPayload
            {
                score = replayData.FinalScore,
                replayData = new ReplayPayload
                {
                    seed = replayData.Seed.ToString(),
                    inputTimeline = SerializeInputTimeline(replayData.Inputs),
                    duration = replayData.FinalTick
                }
            };

            string body = JsonUtility.ToJson(payload);

            for (int attempt = 0; attempt < SUBMIT_RETRIES; attempt++)
            {
                try
                {
                    string url = $"{_apiEndpoint}/sessions/{SessionId}/end";
                    string response = await PostRequest(url, body);

                    if (response != null)
                    {
                        var outcome = JsonUtility.FromJson<SessionOutcome>(response);
                        State = SessionState.Done;
                        return outcome;
                    }
                }
                catch (Exception e)
                {
                    Debug.LogWarning($"[OGHubBridge] Submit attempt {attempt + 1} failed: {e.Message}");
                }

                if (attempt < SUBMIT_RETRIES - 1)
                {
                    float delay = Mathf.Pow(2, attempt);
                    await Task.Delay((int)(delay * 1000));
                }
            }

            CacheSubmission(body);
            State = SessionState.Failed;
            return null;
        }

        public void ReportEvent(string eventType, string dataJson)
        {
            _ = SendEventAsync(eventType, dataJson);
        }

        public void Reset()
        {
            State = SessionState.Idle;
            SessionId = null;
            SessionToken = null;
            ChallengeId = null;
            LoadedGhost = null;
            CurrentConfig = GameConfig.Default;
        }

        private async Task SendEventAsync(string eventType, string dataJson)
        {
            try
            {
                string url = $"{_apiEndpoint}/sessions/{SessionId}/events";
                string body = $"{{\"events\":[{{\"type\":\"{eventType}\",\"data\":{dataJson}}}]}}";
                await PostRequest(url, body);
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[OGHubBridge] Event send failed: {e.Message}");
            }
        }

        private async Task<string> PostRequest(string url, string body)
        {
            using var request = new UnityWebRequest(url, "POST");
            byte[] bodyBytes = Encoding.UTF8.GetBytes(body);
            request.uploadHandler = new UploadHandlerRaw(bodyBytes);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");
            if (!string.IsNullOrEmpty(SessionToken))
                request.SetRequestHeader("Authorization", $"Bearer {SessionToken}");
            request.timeout = (int)HTTP_TIMEOUT;

            var op = request.SendWebRequest();
            while (!op.isDone)
                await Task.Yield();

            if (request.result == UnityWebRequest.Result.Success)
                return request.downloadHandler.text;

            Debug.LogWarning($"[OGHubBridge] HTTP {request.responseCode}: {request.error}");
            return null;
        }

        private GhostData ParseGhostData(GhostDataJson json)
        {
            try
            {
                var inputs = new List<TickInput>();
                if (json.inputTimeline != null)
                {
                    foreach (var entry in json.inputTimeline)
                    {
                        inputs.Add(new TickInput(entry.tick, (InputAction)entry.action));
                    }
                }
                return new GhostData
                {
                    Seed = long.Parse(json.seed),
                    Inputs = inputs,
                    Duration = json.duration,
                    PlayerName = json.playerName,
                    Score = json.score
                };
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[OGHubBridge] Ghost parse failed: {e.Message}");
                return null;
            }
        }

        private string SerializeInputTimeline(IReadOnlyList<TickInput> inputs)
        {
            var sb = new StringBuilder("[");
            for (int i = 0; i < inputs.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append($"{{\"tick\":{inputs[i].Tick},\"action\":{(byte)inputs[i].Action}}}");
            }
            sb.Append(']');
            return sb.ToString();
        }

        private void CacheSubmission(string body)
        {
            PlayerPrefs.SetString("CachedSubmission_SessionId", SessionId);
            PlayerPrefs.SetString("CachedSubmission_Body", body);
            PlayerPrefs.Save();
            Debug.Log("[OGHubBridge] Score cached for retry on next launch");
        }

        private async void RetryCachedSubmission()
        {
            string cachedSessionId = PlayerPrefs.GetString("CachedSubmission_SessionId", "");
            string cachedBody = PlayerPrefs.GetString("CachedSubmission_Body", "");

            if (string.IsNullOrEmpty(cachedSessionId) || string.IsNullOrEmpty(cachedBody))
                return;

            Debug.Log("[OGHubBridge] Retrying cached score submission...");
            try
            {
                string url = $"{_apiEndpoint}/sessions/{cachedSessionId}/end";
                string response = await PostRequest(url, cachedBody);
                if (response != null)
                {
                    PlayerPrefs.DeleteKey("CachedSubmission_SessionId");
                    PlayerPrefs.DeleteKey("CachedSubmission_Body");
                    PlayerPrefs.Save();
                    Debug.Log("[OGHubBridge] Cached submission succeeded");
                }
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[OGHubBridge] Cached retry failed: {e.Message}");
            }
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

        [Serializable] private class ValidatePayload { public string gameId; }
        [Serializable] private class ValidateResponse { public GhostDataJson ghostData; }

        [Serializable] public class GhostDataJson
        {
            public string seed;
            public InputEntry[] inputTimeline;
            public int duration;
            public string playerName;
            public int score;
        }

        [Serializable] public class InputEntry
        {
            public int tick;
            public int action;
        }

        [Serializable] private class EndSessionPayload
        {
            public int score;
            public ReplayPayload replayData;
        }

        [Serializable] private class ReplayPayload
        {
            public string seed;
            public string inputTimeline;
            public int duration;
        }
    }

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
