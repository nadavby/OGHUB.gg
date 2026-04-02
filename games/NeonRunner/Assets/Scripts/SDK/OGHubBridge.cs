using System;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace NeonRunner.SDK
{
    /// <summary>
    /// Unity bridge for the OGHUB platform SDK.
    /// Handles session lifecycle, score submission, and ghost data loading via real HTTP calls.
    /// </summary>
    public sealed class OGHubBridge : MonoBehaviour
    {
        public static OGHubBridge Instance { get; private set; }

        [Header("SDK Configuration")]
        [SerializeField] private string _gameId = "neon-runner";
        [SerializeField] private string _apiEndpoint = "http://localhost:3001/api";

        public string GameId => _gameId;
        public string ChallengeId { get; private set; }
        public string SessionToken { get; private set; }
        public string SessionId { get; private set; }

        public bool IsInitialized { get; private set; }
        public Core.GameConfig CurrentConfig { get; private set; }

        private void Awake()
        {
            if (Instance == null)
            {
                Instance = this;
                DontDestroyOnLoad(gameObject);

                // ─── OS Deep Link Listener ───
                Application.deepLinkActivated += OnDeepLinkActivated;
                if (!string.IsNullOrEmpty(Application.absoluteURL))
                {
                    OnDeepLinkActivated(Application.absoluteURL);
                }
            }
            else
            {
                Destroy(gameObject);
            }
        }

        private void OnDeepLinkActivated(string url)
        {
            Debug.Log($"[OGHub] App Native Launch via Deep Link: {url}");
            // Parse: neon-runner://session?token=abc&seed=123&challengeId=c1&sessionId=s1
            try
            {
                var uri = new Uri(url);
                var queryParams = System.Web.HttpUtility.ParseQueryString(uri.Query);

                string token = queryParams.Get("token");
                string seedStr = queryParams.Get("seed");
                string challengeId = queryParams.Get("challengeId");
                string sessionId = queryParams.Get("sessionId");

                if (long.TryParse(seedStr, out long seed))
                {
                    SessionId = sessionId;
                    InitializeGame(seed, challengeId, token);
                    UnityEngine.SceneManagement.SceneManager.LoadScene(1);
                }
            }
            catch (Exception e)
            {
                Debug.LogError($"[OGHub] Failed to parse Deep Link: {e.Message}");
            }
        }

        /// <summary>
        /// Initializes the SDK with session configuration from the platform.
        /// </summary>
        public void InitializeGame(long seed, string challengeId, string token)
        {
            ChallengeId = challengeId;
            SessionToken = token;

            CurrentConfig = new Core.GameConfig
            {
                Seed = seed,
                Modifiers = Core.GameModifiers.None,
                StartingLives = 1
            };

            IsInitialized = true;
            Debug.Log($"[OGHub] Initiated with Seed: {seed}, Challenge: {challengeId}");
        }

        /// <summary>
        /// Validates the session with the backend via POST /api/sessions/{SessionId}/validate.
        /// </summary>
        public async Task StartSession()
        {
            if (!IsInitialized) throw new Exception("SDK not initialized");
            if (string.IsNullOrEmpty(SessionId)) throw new Exception("SessionId not set");

            string url = $"{_apiEndpoint}/sessions/{SessionId}/validate";
            using var request = new UnityWebRequest(url, "POST");
            request.SetRequestHeader("Authorization", $"Bearer {SessionToken}");
            request.SetRequestHeader("Content-Type", "application/json");
            request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes("{}"));
            request.downloadHandler = new DownloadHandlerBuffer();

            var op = request.SendWebRequest();
            while (!op.isDone) await Task.Yield();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError($"[OGHub] StartSession failed: {request.error} — {request.downloadHandler.text}");
                throw new Exception($"Session validation failed: {request.error}");
            }

            Debug.Log($"[OGHub] Session validated: {request.downloadHandler.text}");
        }

        /// <summary>
        /// Fire-and-forget event report via POST /api/sessions/{SessionId}/events.
        /// </summary>
        public void ReportEvent(string eventType, string dataJson)
        {
            if (string.IsNullOrEmpty(SessionId)) return;
            _ = SendEventAsync(eventType, dataJson);
        }

        private async Task SendEventAsync(string eventType, string dataJson)
        {
            try
            {
                string url = $"{_apiEndpoint}/sessions/{SessionId}/events";
                string body = $"{{\"events\":[{{\"eventType\":\"{eventType}\",\"payload\":{dataJson},\"timestamp\":{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()},\"sequence\":0}}]}}";

                using var request = new UnityWebRequest(url, "POST");
                request.SetRequestHeader("Authorization", $"Bearer {SessionToken}");
                request.SetRequestHeader("Content-Type", "application/json");
                request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
                request.downloadHandler = new DownloadHandlerBuffer();

                var op = request.SendWebRequest();
                while (!op.isDone) await Task.Yield();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogWarning($"[OGHub] ReportEvent failed: {request.error}");
                }
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[OGHub] ReportEvent exception: {e.Message}");
            }
        }

        [Serializable]
        private class EndSessionPayload
        {
            public int score;
            public ReplayPayload replayData;
        }

        [Serializable]
        private class ReplayPayload
        {
            public string seed;
            public string inputTimeline;
            public int duration;
        }

        /// <summary>
        /// Ends the session, submitting the score and replay data via POST /api/sessions/{SessionId}/end.
        /// </summary>
        public async Task<bool> EndSession(Core.ReplayData replayData)
        {
            if (string.IsNullOrEmpty(SessionId)) throw new Exception("SessionId not set");

            Debug.Log($"[OGHub] Submitting Run. Score: {replayData.FinalScore}, Tick: {replayData.FinalTick}");

            string url = $"{_apiEndpoint}/sessions/{SessionId}/end";
            var payload = new EndSessionPayload
            {
                score = replayData.FinalScore,
                replayData = new ReplayPayload
                {
                    seed = replayData.Seed ?? "",
                    inputTimeline = "[]",
                    duration = replayData.FinalTick
                }
            };

            string body = JsonUtility.ToJson(payload);

            using var request = new UnityWebRequest(url, "POST");
            request.SetRequestHeader("Authorization", $"Bearer {SessionToken}");
            request.SetRequestHeader("Content-Type", "application/json");
            request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
            request.downloadHandler = new DownloadHandlerBuffer();

            var op = request.SendWebRequest();
            while (!op.isDone) await Task.Yield();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError($"[OGHub] EndSession failed: {request.error} — {request.downloadHandler.text}");
                return false;
            }

            Debug.Log($"[OGHub] EndSession response: {request.downloadHandler.text}");
            return true;
        }

        /// <summary>
        /// Fetches ghost (replay) data for a given challenge via GET /api/ghosts/{challengeId}/top.
        /// </summary>
        public async Task<Core.ReplayData> RequestGhostData(string challengeId, string type = "personal_best")
        {
            Debug.Log($"[OGHub] Fetching ghost '{type}' for challenge {challengeId}...");

            string url = $"{_apiEndpoint}/ghosts/{challengeId}/top";

            using var request = UnityWebRequest.Get(url);
            request.SetRequestHeader("Authorization", $"Bearer {SessionToken}");

            var op = request.SendWebRequest();
            while (!op.isDone) await Task.Yield();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogWarning($"[OGHub] RequestGhostData failed: {request.error}");
                return null;
            }

            Debug.Log($"[OGHub] Ghost data: {request.downloadHandler.text}");
            // Parse response into ReplayData — depends on game-specific deserialization
            return null;
        }
    }
}
