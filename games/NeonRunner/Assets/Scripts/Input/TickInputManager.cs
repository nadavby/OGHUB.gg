using System.Collections.Generic;

namespace NeonRunner.Core
{
    /// <summary>
    /// Records player inputs strictly by simulation tick.
    /// Used for deterministic replay and ghost generation.
    /// </summary>
    public sealed class TickInputManager
    {
        private readonly List<TickInput> _recordedInputs = new List<TickInput>(1024);
        private int _currentTick;

        // Buffers input from Unity's Update until the next fixed simulation tick
        private InputAction _pendingAction = InputAction.None;

        public IReadOnlyList<TickInput> RecordedInputs => _recordedInputs;

        public void RegisterInput(InputAction action)
        {
            // If multiple inputs happen before a tick, keep the most recent
            // Note: In a more complex game, we might allow multiple actions per tick
            // but for a 3-lane runner, one action per tick is sufficient.
            _pendingAction = action;
        }

        public void CommitTick(int tick)
        {
            _currentTick = tick;

            if (_pendingAction != InputAction.None)
            {
                _recordedInputs.Add(new TickInput(tick, _pendingAction));
                _pendingAction = InputAction.None;
            }
        }

        /// <summary>
        /// Retrieves the action for a specific tick from recorded data (used during replay).
        /// </summary>
        public InputAction GetActionForTick(int tick)
        {
            // Binary search could be used, but sequential runs will just 
            // read forward linearly. For simplicity here, we assume an 
            // external playback iterator handles it, but this is a fallback.
            for (int i = _recordedInputs.Count - 1; i >= 0; i--)
            {
                if (_recordedInputs[i].Tick == tick)
                    return _recordedInputs[i].Action;
                if (_recordedInputs[i].Tick < tick)
                    break;
            }
            return InputAction.None;
        }

        public void Reset()
        {
            _recordedInputs.Clear();
            _pendingAction = InputAction.None;
            _currentTick = 0;
        }
    }
}
