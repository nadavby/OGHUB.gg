using System;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace NeonRunner.SDK
{
    /// <summary>
    /// Unity bridge for the OGHUB platform SDK.
    /// Handles session lifecycle, score submission, and ghost data loading.
    /// </summary>
    public sealed class OGHubBridge : MonoBehaviour
    {
        public static OGHubBridge Instance { get; private set; }

        [Header("SDK Configuration")]
        [SerializeField] private string _gameId = "neon-runner";
        [SerializeField] private string _apiEndpoint = "http://localhost:3000/api";
        
        public string GameId => _gameId;
        public string ChallengeId { get; private set; }
        public string SessionToken { get; private set; }
        
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
                    // Catch link if app was closed and then opened via link
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
            // Parse: neon-runner://session?token=abc&seed=123&challengeId=c1
            try 
            {
                var uri = new Uri(url);
                var queryParams = System.Web.HttpUtility.ParseQueryString(uri.Query);
                
                string token = queryParams.Get("token");
                string seedStr = queryParams.Get("seed");
                string challengeId = queryParams.Get("challengeId");

                if (long.TryParse(seedStr, out long seed))
                {
                    InitializeGame(seed, challengeId, token);
                    // Launch Main Menu or start gameplay automatically
                    UnityEngine.SceneManagement.SceneManager.LoadScene(1); 
                }
            }
            catch(Exception e)
            {
                Debug.LogError($"[OGHub] Failed to parse Deep Link: {e.Message}");
            }
        }

        /// <summary>
        /// Mock initialization. In production, this receives config from the App/SDK router.
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

        public async Task StartSession()
        {
            if (!IsInitialized) throw new Exception("SDK not initialized");
            
            // In a real implementation this sends a "Session_Start" to backend
            ReportEvent("Session_Start", "{}");
            await Task.Yield();
        }

        public void ReportEvent(string eventType, string dataJson)
        {
            // E.g., batch HTTP call to POST /api/events
            Debug.Log($"[OGHub] EVENT: {eventType} | Data: {dataJson}");
        }

        /// <summary>
        /// Ends the session, submitting the score and signed replay hash.
        /// </summary>
        public async Task<bool> EndSession(Core.ReplayData replayData)
        {
            Debug.Log($"[OGHub] Submitting Run. Score: {replayData.FinalScore}, Tick: {replayData.FinalTick}");
            Debug.Log($"[OGHub] Hash: {replayData.Hash}");

            ReportEvent("Session_End", $"{{\"score\":{replayData.FinalScore}, \"hash\":\"{replayData.Hash}\"}}");

            // Mock network call
            await Task.Delay(500);

            // True implementation sends replayData to backend
            // POST /api/sessions/complete
            
            return true;
        }

        /// <summary>
        /// Fetches ghost (replay) data for a given challenge.
        /// </summary>
        public async Task<Core.ReplayData> RequestGhostData(string challengeId, string type = "personal_best")
        {
            Debug.Log($"[OGHub] Fetching ghost '{type}' for challenge {challengeId}...");
            await Task.Delay(300);
            return null; // Implemented via real HTTP in production
        }
    }
}
