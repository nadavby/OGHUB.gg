using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Net.WebSockets;
using UnityEngine;

namespace OGHub
{
    public sealed class OGHubWebSocket
    {
        private ClientWebSocket _ws;
        private CancellationTokenSource _cts;
        private readonly Queue<string> _sendQueue = new();
        private Func<Dictionary<string, object>> _validationHandler;
        private Action<string> _leaderboardHandler;
        private string _url;
        private int _reconnectAttempts;

        public async Task Connect(string wsUrl, string sessionId, string token)
        {
            _url = $"{wsUrl}?sessionId={sessionId}&token={token}";
            _cts = new CancellationTokenSource();
            await DoConnect();
        }

        private async Task DoConnect()
        {
            _ws = new ClientWebSocket();
            try
            {
                await _ws.ConnectAsync(new Uri(_url), _cts.Token);
                _reconnectAttempts = 0;
                while (_sendQueue.Count > 0)
                    await SendRaw(_sendQueue.Dequeue());
                _ = ReceiveLoop();
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[OGHub WS] Connect failed: {e.Message}");
                await TryReconnect();
            }
        }

        private async Task ReceiveLoop()
        {
            var buffer = new byte[4096];
            try
            {
                while (_ws.State == WebSocketState.Open && !_cts.IsCancellationRequested)
                {
                    var result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), _cts.Token);
                    if (result.MessageType == WebSocketMessageType.Close) break;
                    string msg = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    HandleMessage(msg);
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception e)
            {
                Debug.LogWarning($"[OGHub WS] Receive error: {e.Message}");
            }
            await TryReconnect();
        }

        private void HandleMessage(string raw)
        {
            try
            {
                if (raw.Contains("\"validation_request\"") && _validationHandler != null)
                {
                    var state = _validationHandler();
                    string requestId = ExtractField(raw, "requestId");
                    string stateJson = DictToJson(state);
                    string response = $"{{\"type\":\"validation_response\",\"requestId\":\"{requestId}\",\"state\":{stateJson}}}";
                    Send(response);
                }
                else if (raw.Contains("\"leaderboard_update\""))
                {
                    _leaderboardHandler?.Invoke(raw);
                }
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[OGHub WS] Message handling error: {e.Message}");
            }
        }

        public void OnValidationRequest(Func<Dictionary<string, object>> handler)
        {
            _validationHandler = handler;
        }

        public void OnLeaderboardUpdate(Action<string> handler)
        {
            _leaderboardHandler = handler;
        }

        public void SendScoreUpdate(int score, string hash, int sequence)
        {
            Send($"{{\"type\":\"score_update\",\"score\":{score},\"hash\":\"{hash}\",\"sequence\":{sequence}}}");
        }

        public void Send(string json)
        {
            if (_ws != null && _ws.State == WebSocketState.Open)
                _ = SendRaw(json);
            else
                _sendQueue.Enqueue(json);
        }

        private async Task SendRaw(string json)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(json);
            await _ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, _cts.Token);
        }

        private async Task TryReconnect()
        {
            if (_reconnectAttempts >= 5 || _cts.IsCancellationRequested) return;
            _reconnectAttempts++;
            int delay = (int)Math.Pow(2, _reconnectAttempts) * 1000;
            await Task.Delay(delay);
            if (!_cts.IsCancellationRequested) await DoConnect();
        }

        public async Task Disconnect()
        {
            _cts?.Cancel();
            if (_ws?.State == WebSocketState.Open)
            {
                try { await _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None); }
                catch { }
            }
            _ws?.Dispose();
        }

        private static string ExtractField(string json, string field)
        {
            int idx = json.IndexOf($"\"{field}\"");
            if (idx < 0) return "";
            int start = json.IndexOf(':', idx) + 1;
            while (start < json.Length && json[start] == ' ') start++;
            if (start < json.Length && json[start] == '"')
            {
                start++;
                int end = json.IndexOf('"', start);
                return json.Substring(start, end - start);
            }
            int endNum = json.IndexOfAny(new[] { ',', '}' }, start);
            return json.Substring(start, endNum - start).Trim();
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
                else sb.Append(kv.Value);
            }
            sb.Append('}');
            return sb.ToString();
        }
    }
}
