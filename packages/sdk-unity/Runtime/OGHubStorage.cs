using UnityEngine;

namespace OGHub
{
    public static class OGHubStorage
    {
        private const string CacheSessionKey = "OGHub_CachedSessionId";
        private const string CacheBodyKey = "OGHub_CachedBody";

        public static void CacheSubmission(string sessionId, string body)
        {
            PlayerPrefs.SetString(CacheSessionKey, sessionId);
            PlayerPrefs.SetString(CacheBodyKey, body);
            PlayerPrefs.Save();
        }

        public static (string sessionId, string body)? GetCachedSubmission()
        {
            string sid = PlayerPrefs.GetString(CacheSessionKey, "");
            string body = PlayerPrefs.GetString(CacheBodyKey, "");
            if (string.IsNullOrEmpty(sid) || string.IsNullOrEmpty(body)) return null;
            return (sid, body);
        }

        public static void ClearCache()
        {
            PlayerPrefs.DeleteKey(CacheSessionKey);
            PlayerPrefs.DeleteKey(CacheBodyKey);
            PlayerPrefs.Save();
        }
    }
}
