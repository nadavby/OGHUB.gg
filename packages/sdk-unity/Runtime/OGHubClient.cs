using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace OGHub
{
    [Serializable]
    public class OGHubConfig
    {
        public string apiKey;
        public string apiSecret;
        public string gameSlug;
        public string apiUrl;
    }

    [Serializable]
    public class OGHubSession
    {
        public string id;
        public string token;
        public string seed;
        public string config;
        public string ghostDataJson;
    }

    [Serializable]
    public class OGHubSessionResult
    {
        public bool accepted;
        public int score;
        public int rank;
        public string nearMissJson;
    }

    public sealed class OGHubClient
    {
        private OGHubConfig _config;
        private OGHubIntegrity _integrity;
        private OGHubWebSocket _websocket;
        private OGHubSession _session;
        private readonly List<string> _inputTimeline = new();
        private int _sequenceCounter;
        private long _startTimeMs;
        private int _lastScore;
        private int _scoreSequence;
        private readonly List<string> _eventBuffer = new();

        public async Task Init(OGHubConfig config)
        {
            _config = config;
            _integrity = new OGHubIntegrity(config.apiSecret);
            _websocket = new OGHubWebSocket();
        }

        public async Task<OGHubSession> CreateSession(string challengeId = null)
        {
            string body = challengeId != null
                ? $"{{\"gameId\":\"{_config.gameSlug}\",\"challengeId\":\"{challengeId}\"}}"
                : $"{{\"gameId\":\"{_config.gameSlug}\"}}";

            string response = await PostRequest("/api/sessions/create", body);
            var createResult = JsonUtility.FromJson<CreateResponse>(WrapData(response));

            _session = new OGHubSession
            {
                id = createResult.sessionId,
                token = createResult.token,
                seed = createResult.seed,
            };
            _integrity.SetSessionId(_session.id);

            // Validate
            await PostRequest($"/api/sessions/{_session.id}/validate", "{}", _session.token);

            // Connect WebSocket
            string wsUrl = _config.apiUrl.Replace("http", "ws") + "/api/sessions/live";
            await _websocket.Connect(wsUrl, _session.id, _session.token);

            return _session;
        }

        public void StartSession()
        {
            _startTimeMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            _sequenceCounter = 0;
            _scoreSequence = 0;
            _lastScore = 0;
            _inputTimeline.Clear();
            _eventBuffer.Clear();
        }

        public void ReportInput(string name, Dictionary<string, object> data = null)
        {
            int seq = _sequenceCounter++;
            long timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - _startTimeMs;

            string dataJson = data != null ? DictToJson(data) : "{}";
            _inputTimeline.Add($"{{\"name\":\"{name}\",\"data\":{dataJson},\"timestamp\":{timestamp},\"sequence\":{seq}}}");

            _eventBuffer.Add($"{{\"eventType\":\"input:{name}\",\"payload\":{dataJson},\"timestamp\":{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()},\"sequence\":{seq}}}");

            if (_eventBuffer.Count >= 50) _ = FlushEvents();
        }

        public void UpdateScore(int score)
        {
            _lastScore = score;
            int seq = _scoreSequence++;
            string hash = _integrity.ComputeScoreHash(score, seq);
            _websocket.SendScoreUpdate(score, hash, seq);
        }

        public void OnValidationRequest(Func<Dictionary<string, object>> handler)
        {
            _websocket.OnValidationRequest(handler);
        }

        public async Task<OGHubSessionResult> EndSession()
        {
            await FlushEvents();

            string timeline = "[" + string.Join(",", _inputTimeline) + "]";
            long duration = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - _startTimeMs;
            string checksum = _integrity.ComputeReplayChecksum(timeline);

            string body = $"{{\"score\":{_lastScore},\"replayData\":{{\"seed\":\"{_session.seed}\",\"inputTimeline\":{timeline},\"duration\":{duration},\"checksum\":\"{checksum}\"}}}}";

            string response = await PostRequest(
                $"/api/sessions/{_session.id}/end", body, _session.token
            );

            await _websocket.Disconnect();
            _integrity.Reset();

            if (response == null)
            {
                OGHubStorage.CacheSubmission(_session.id, body);
                return null;
            }

            return JsonUtility.FromJson<OGHubSessionResult>(WrapData(response));
        }

        private async Task FlushEvents()
        {
            if (_eventBuffer.Count == 0 || _session == null) return;
            var events = new List<string>(_eventBuffer);
            _eventBuffer.Clear();

            try
            {
                string body = "{\"events\":[" + string.Join(",", events) + "]}";
                await PostRequest($"/api/sessions/{_session.id}/events", body, _session.token);
            }
            catch
            {
                _eventBuffer.InsertRange(0, events);
            }
        }

        private async Task<string> PostRequest(string path, string body, string bearerToken = null)
        {
            string url = _config.apiUrl + path;
            var (signature, timestamp, nonce) = _integrity.Sign(body);

            using var request = new UnityWebRequest(url, "POST");
            byte[] bodyBytes = Encoding.UTF8.GetBytes(body);
            request.uploadHandler = new UploadHandlerRaw(bodyBytes);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("x-oghub-api-key", _config.apiKey);
            request.SetRequestHeader("x-oghub-signature", signature);
            request.SetRequestHeader("x-oghub-timestamp", timestamp);
            request.SetRequestHeader("x-oghub-nonce", nonce);
            request.SetRequestHeader("x-oghub-sdk-version", "2.0.0");
            if (bearerToken != null) request.SetRequestHeader("Authorization", $"Bearer {bearerToken}");
            request.timeout = 10;

            var op = request.SendWebRequest();
            while (!op.isDone) await Task.Yield();

            if (request.result == UnityWebRequest.Result.Success)
                return request.downloadHandler.text;

            Debug.LogWarning($"[OGHub] HTTP {request.responseCode}: {request.error}");
            return null;
        }

        // JsonUtility needs the data to be wrapped if the API returns {success, data}
        private static string WrapData(string apiResponse)
        {
            // Simple extraction: find "data": and return from there
            int idx = apiResponse.IndexOf("\"data\":");
            if (idx < 0) return apiResponse;
            int start = idx + 7;
            // Find the matching closing brace
            int depth = 0;
            for (int i = start; i < apiResponse.Length; i++)
            {
                if (apiResponse[i] == '{') depth++;
                else if (apiResponse[i] == '}')
                {
                    depth--;
                    if (depth == 0) return apiResponse.Substring(start, i - start + 1);
                }
            }
            return apiResponse;
        }

        private static string DictToJson(Dictionary<string, object> dict)
        {
            var sb = new StringBuilder("{");
            bool first = true;
            foreach (var kv in dict)
            {
                if (!first) sb.Append(',');
                first = false;
                sb.Append($"\"{kv.Key}\":");
                if (kv.Value is string s) sb.Append($"\"{s}\"");
                else if (kv.Value is bool b) sb.Append(b ? "true" : "false");
                else if (kv.Value is Dictionary<string, object> nested) sb.Append(DictToJson(nested));
                else sb.Append(kv.Value);
            }
            sb.Append('}');
            return sb.ToString();
        }

        [Serializable]
        private class CreateResponse
        {
            public string sessionId;
            public string token;
            public string seed;
        }
    }
}
