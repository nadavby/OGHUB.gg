using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace OGHub
{
    /// <summary>
    /// Static facade for OGHub SDK. Plug-and-play integration.
    /// </summary>
    public static class OGHubSDK
    {
        private static readonly OGHubClient _client = new();

        public static Task Init(OGHubConfig config) => _client.Init(config);

        public static Task<OGHubSession> CreateSession(string challengeId = null)
            => _client.CreateSession(challengeId);

        public static void StartSession() => _client.StartSession();

        public static void ReportInput(string name, Dictionary<string, object> data = null)
            => _client.ReportInput(name, data);

        public static void UpdateScore(int score) => _client.UpdateScore(score);

        public static void OnValidationRequest(Func<Dictionary<string, object>> handler)
            => _client.OnValidationRequest(handler);

        public static Task<OGHubSessionResult> EndSession() => _client.EndSession();
    }
}
