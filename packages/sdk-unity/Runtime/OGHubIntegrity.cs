using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;

namespace OGHub
{
    public sealed class OGHubIntegrity
    {
        private readonly string _apiSecret;
        private readonly List<string> _scoreHashChain = new();
        private string _sessionId = "";

        public OGHubIntegrity(string apiSecret)
        {
            _apiSecret = apiSecret;
        }

        public void SetSessionId(string id)
        {
            _sessionId = id;
            _scoreHashChain.Clear();
        }

        public (string signature, string timestamp, string nonce) Sign(string body)
        {
            string timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
            string nonce = Guid.NewGuid().ToString("N");
            string payload = $"{timestamp}:{nonce}:{body}";

            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_apiSecret));
            byte[] hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
            string signature = BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();

            return (signature, timestamp, nonce);
        }

        public string ComputeScoreHash(int score, int sequence)
        {
            string previous = _scoreHashChain.Count > 0
                ? _scoreHashChain[^1]
                : _sessionId;
            string payload = $"{previous}:{score}:{sequence}";

            using var sha = SHA256.Create();
            byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(payload));
            string hex = BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
            _scoreHashChain.Add(hex);
            return hex;
        }

        public string ComputeReplayChecksum(string inputTimelineJson)
        {
            using var sha = SHA256.Create();
            byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(inputTimelineJson));
            return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
        }

        public void Reset()
        {
            _scoreHashChain.Clear();
            _sessionId = "";
        }
    }
}
