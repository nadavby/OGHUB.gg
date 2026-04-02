using UnityEngine;
using NeonRunner.Core;

namespace NeonRunner.UI
{
    /// <summary>
    /// Displays HUD and manages post-run menus.
    /// Note: To fully enable, install the "Unity UI" or "TextMeshPro" package from the Package Manager
    /// and change Component back to TextMeshProUGUI / Image.
    /// </summary>
    public class UIManager : MonoBehaviour
    {
        public static UIManager Instance { get; private set; }

        [Header("HUD")]
        [SerializeField] private Component _scoreText;
        [SerializeField] private Component _comboPulseText;
        [SerializeField] private Component _riskMeterFill;
        [SerializeField] private GameObject _ghostDeltaUI;

        [Header("Post Run")]
        [SerializeField] private GameObject _postRunPanel;
        [SerializeField] private Component _finalScoreText;
        [SerializeField] private Component _breakdownText;

        private void Awake()
        {
            Instance = this;
            _postRunPanel.SetActive(false);
        }

        private void Update()
        {
            if (Game.GameManager.Instance == null) return;
            
            var snap = Game.GameManager.Instance.GetCurrentSnapshot();

            // HUD
            // _scoreText.text = snap.Score.ToString("N0");
            
            if (snap.ComboCount > 1)
            {
                _comboPulseText.gameObject.SetActive(true);
                // _comboPulseText.text = $"x{snap.ComboMultiplier.ToFloat():F1}";
                // In production: add pop/pulse animation here
            }
            else
            {
                _comboPulseText.gameObject.SetActive(false);
            }

            // Sync phase colors or risk meter here
        }

        public void ShowPostRunScreen(ReplayData replayData, SimulationSnapshot finalSnap)
        {
            _postRunPanel.SetActive(true);
            
            /*
            _finalScoreText.text = $"FINAL SCORE\n{replayData.FinalScore:N0}";

            _breakdownText.text = $@"
Distance Score: {(replayData.FinalScore - (finalSnap.NearMisses * 100 + finalSnap.PerfectDodges * 200)):N0}
Max Combo: x{finalSnap.MaxCombo}
Perfect Dodges: {finalSnap.PerfectDodges}
Near Misses: {finalSnap.NearMisses}
Skill Gates Passed: {finalSnap.SkillGatesPassed}
            ";
            */
        }

        // Bound to a button in the UI
        public void OnRestartClicked()
        {
            // Reset simulation via GM or restart scene
            UnityEngine.SceneManagement.SceneManager.LoadScene(0);
        }
    }
}
