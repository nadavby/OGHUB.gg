// Runtime neon cyberpunk menu builder — creates stunning main menu visuals
using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace NeonRunner.UI
{
    public sealed class NeonMenuBuilder : MonoBehaviour
    {
        private void Start()
        {
            SetupBackground();
            UpgradeTitle();
            UpgradeButtons();
            UpgradeBestScore();
            CreateDecorations();
        }

        private void SetupBackground()
        {
            // Dark cyberpunk background
            var cam = Camera.main;
            if (cam != null)
            {
                cam.clearFlags = CameraClearFlags.SolidColor;
                cam.backgroundColor = new Color(0.008f, 0.005f, 0.02f);
            }

            // Create background canvas behind everything
            var bgCanvas = new GameObject("BackgroundCanvas");
            var canvas = bgCanvas.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = -10;
            bgCanvas.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            bgCanvas.GetComponent<CanvasScaler>().referenceResolution = new Vector2(1080, 1920);

            // Gradient background image
            var bgImg = new GameObject("BgGradient");
            bgImg.transform.SetParent(bgCanvas.transform, false);
            var bgRect = bgImg.AddComponent<RectTransform>();
            bgRect.anchorMin = Vector2.zero;
            bgRect.anchorMax = Vector2.one;
            bgRect.sizeDelta = Vector2.zero;
            var img = bgImg.AddComponent<Image>();
            img.color = new Color(0.02f, 0.01f, 0.05f, 1f);

            // Add animated grid lines in background
            CreateBgGridLines(bgCanvas.transform);

            // Add floating particles
            CreateBgParticles(bgCanvas.transform);
        }

        private void CreateBgGridLines(Transform parent)
        {
            // Horizontal scanlines
            for (int i = 0; i < 20; i++)
            {
                var lineObj = new GameObject($"ScanLine_{i}");
                lineObj.transform.SetParent(parent, false);
                var rect = lineObj.AddComponent<RectTransform>();
                float yPos = (i / 20f) * 2f - 1f;
                rect.anchorMin = new Vector2(0, (float)i / 20f);
                rect.anchorMax = new Vector2(1, (float)i / 20f);
                rect.sizeDelta = new Vector2(0, 1);
                var lineImg = lineObj.AddComponent<Image>();
                lineImg.color = new Color(0, 0.8f, 0.8f, 0.03f);
            }

            // Vertical accent lines
            float[] xPositions = { 0.15f, 0.5f, 0.85f };
            for (int i = 0; i < xPositions.Length; i++)
            {
                var lineObj = new GameObject($"VertLine_{i}");
                lineObj.transform.SetParent(parent, false);
                var rect = lineObj.AddComponent<RectTransform>();
                rect.anchorMin = new Vector2(xPositions[i], 0);
                rect.anchorMax = new Vector2(xPositions[i], 1);
                rect.sizeDelta = new Vector2(1, 0);
                var lineImg = lineObj.AddComponent<Image>();
                lineImg.color = new Color(0.5f, 0, 1f, 0.04f);
            }
        }

        private void CreateBgParticles(Transform parent)
        {
            for (int i = 0; i < 12; i++)
            {
                var dot = new GameObject($"Particle_{i}");
                dot.transform.SetParent(parent, false);
                var rect = dot.AddComponent<RectTransform>();
                rect.anchorMin = new Vector2(Random.Range(0f, 1f), Random.Range(0f, 1f));
                rect.anchorMax = rect.anchorMin;
                rect.sizeDelta = new Vector2(Random.Range(2f, 6f), Random.Range(2f, 6f));
                var dotImg = dot.AddComponent<Image>();
                Color[] cols = {
                    new Color(0, 1, 1, 0.3f),
                    new Color(1, 0, 0.5f, 0.25f),
                    new Color(0.5f, 0, 1, 0.2f)
                };
                dotImg.color = cols[i % 3];
                dot.AddComponent<FloatingDot>();
            }
        }

        private void UpgradeTitle()
        {
            var titleGo = GameObject.Find("TitleText");
            if (titleGo == null) return;

            var tmp = titleGo.GetComponent<TMP_Text>();
            if (tmp == null) return;

            tmp.text = "NEON\nRUNNER";
            tmp.fontSize = 90;
            tmp.fontStyle = FontStyles.Bold;
            tmp.alignment = TextAlignmentOptions.Center;
            tmp.characterSpacing = 18;
            tmp.lineSpacing = -20;

            // Neon cyan color with outline
            tmp.color = new Color(0, 1, 1, 1);
            tmp.outlineWidth = 0.2f;
            tmp.outlineColor = new Color(0, 0.3f, 0.5f, 1);

            // Enable glow (only on shaders that support it — not Mobile/Distance Field)
            if (tmp.fontMaterial != null && tmp.fontMaterial.HasProperty("_GlowOuter"))
            {
                tmp.fontMaterial.EnableKeyword("GLOW_ON");
                tmp.fontMaterial.SetColor("_GlowColor", new Color(0, 1, 1, 0.5f));
                tmp.fontMaterial.SetFloat("_GlowOffset", 0.5f);
                tmp.fontMaterial.SetFloat("_GlowOuter", 0.5f);
            }

            // Add rainbow color cycle
            titleGo.AddComponent<NeonTitleEffect>();
        }

        private void UpgradeButtons()
        {
            UpgradeButton("PlayButton", "PLAY", new Color(0, 1, 0.8f), true);
            UpgradeButton("SettingsButton", "SETTINGS", new Color(0.6f, 0.3f, 1f), false);
        }

        private void UpgradeButton(string name, string label, Color neonColor, bool isPrimary)
        {
            var btnGo = GameObject.Find(name);
            if (btnGo == null) return;

            var rect = btnGo.GetComponent<RectTransform>();
            if (rect != null)
            {
                // Make buttons bigger
                float h = isPrimary ? 100 : 70;
                rect.sizeDelta = new Vector2(rect.sizeDelta.x < 300 ? 400 : rect.sizeDelta.x, h);
            }

            // Button background
            var btnImg = btnGo.GetComponent<Image>();
            if (btnImg != null)
            {
                btnImg.color = new Color(neonColor.r * 0.08f, neonColor.g * 0.08f, neonColor.b * 0.08f, 0.9f);
            }

            // Add neon border effect
            var border = btnGo.AddComponent<Outline>();
            border.effectColor = neonColor;
            border.effectDistance = new Vector2(2, 2);

            // Add second outline for glow
            var glow = btnGo.AddComponent<Outline>();
            glow.effectColor = new Color(neonColor.r, neonColor.g, neonColor.b, 0.3f);
            glow.effectDistance = new Vector2(4, 4);

            // Update label text
            var labelTmp = btnGo.GetComponentInChildren<TMP_Text>();
            if (labelTmp != null)
            {
                labelTmp.text = label;
                labelTmp.fontSize = isPrimary ? 42 : 28;
                labelTmp.fontStyle = FontStyles.Bold;
                labelTmp.color = neonColor;
                labelTmp.characterSpacing = 8;
            }

            // Add neon border animation
            btnGo.AddComponent<NeonButtonEffect>().NeonColor = neonColor;
        }

        private void UpgradeBestScore()
        {
            var scoreGo = GameObject.Find("BestScoreText");
            if (scoreGo == null) return;

            var tmp = scoreGo.GetComponent<TMP_Text>();
            if (tmp == null) return;

            tmp.fontSize = 28;
            tmp.color = new Color(0.7f, 0.7f, 0.9f, 0.8f);
            tmp.fontStyle = FontStyles.Normal;
            tmp.characterSpacing = 4;
        }

        private void CreateDecorations()
        {
            // Find the main canvas
            var menuCanvas = GameObject.Find("MenuCanvas");
            if (menuCanvas == null) return;

            var canvasRect = menuCanvas.GetComponent<RectTransform>();
            if (canvasRect == null) return;

            // Top decoration line
            CreateDecoLine(canvasRect, "TopDeco", 0.85f, new Color(0, 1, 1, 0.6f));
            // Bottom decoration line
            CreateDecoLine(canvasRect, "BotDeco", 0.15f, new Color(1, 0, 0.5f, 0.6f));
            // Mid accent
            CreateDecoLine(canvasRect, "MidDeco", 0.5f, new Color(0.5f, 0, 1, 0.3f));
        }

        private void CreateDecoLine(RectTransform parent, string name, float yAnchor, Color color)
        {
            var lineObj = new GameObject(name);
            lineObj.transform.SetParent(parent, false);
            var rect = lineObj.AddComponent<RectTransform>();
            rect.anchorMin = new Vector2(0.05f, yAnchor);
            rect.anchorMax = new Vector2(0.95f, yAnchor);
            rect.sizeDelta = new Vector2(0, 2);
            var img = lineObj.AddComponent<Image>();
            img.color = color;
        }
    }

    // ── Floating dot animation for background particles ──
    public class FloatingDot : MonoBehaviour
    {
        private Vector2 _startAnchor;
        private float _speed;
        private float _amplitude;
        private float _phase;

        private void Start()
        {
            var rect = GetComponent<RectTransform>();
            _startAnchor = rect.anchorMin;
            _speed = Random.Range(0.2f, 0.6f);
            _amplitude = Random.Range(0.01f, 0.04f);
            _phase = Random.Range(0f, Mathf.PI * 2f);
        }

        private void Update()
        {
            var rect = GetComponent<RectTransform>();
            float t = Time.time * _speed + _phase;
            Vector2 anchor = _startAnchor + new Vector2(
                Mathf.Sin(t) * _amplitude,
                Mathf.Cos(t * 0.7f) * _amplitude * 0.5f
            );
            rect.anchorMin = anchor;
            rect.anchorMax = anchor;
        }
    }

    // ── Title neon color shift effect ──
    public class NeonTitleEffect : MonoBehaviour
    {
        private TMP_Text _text;

        private void Start()
        {
            _text = GetComponent<TMP_Text>();
        }

        private void Update()
        {
            if (_text == null) return;

            float t = Time.time * 0.3f;
            // Shift between cyan, magenta, and back
            float r = Mathf.Sin(t) * 0.3f + 0.1f;
            float g = Mathf.Cos(t * 0.7f) * 0.3f + 0.8f;
            float b = 1f;
            _text.color = new Color(r, g, b, 1f);
        }
    }

    // ── Button neon pulse effect ──
    public class NeonButtonEffect : MonoBehaviour
    {
        public Color NeonColor = Color.cyan;
        private Image _image;
        private Outline[] _outlines;

        private void Start()
        {
            _image = GetComponent<Image>();
            _outlines = GetComponents<Outline>();
        }

        private void Update()
        {
            float pulse = Mathf.Sin(Time.time * 2f) * 0.3f + 0.7f;

            if (_image != null)
            {
                _image.color = new Color(
                    NeonColor.r * 0.08f * pulse,
                    NeonColor.g * 0.08f * pulse,
                    NeonColor.b * 0.08f * pulse,
                    0.9f
                );
            }

            if (_outlines != null && _outlines.Length > 0)
            {
                // Outer glow pulses
                for (int i = 0; i < _outlines.Length; i++)
                {
                    float alpha = i == 0 ? pulse : pulse * 0.4f;
                    _outlines[i].effectColor = new Color(NeonColor.r, NeonColor.g, NeonColor.b, alpha);
                }
            }
        }
    }
}
