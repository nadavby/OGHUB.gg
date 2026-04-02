namespace NeonRunner.Core
{
    /// <summary>
    /// Pure deterministic runner movement and collision.
    /// No Unity APIs. All math is fixed-point.
    /// </summary>
    public sealed class RunnerSimulation
    {
        // ─── Constants ──────────────────────────────────────────

        private static readonly Fixed LANE_SWITCH_SPEED = Fixed.FromFloat(0.15f); // Progress per tick
        private static readonly Fixed JUMP_DURATION_TICKS = Fixed.FromInt(30);      // 0.5 seconds
        private static readonly Fixed JUMP_HEIGHT = Fixed.FromFloat(2.5f);
        private static readonly Fixed SLIDE_DURATION_TICKS = Fixed.FromInt(24);     // 0.4 seconds
        private static readonly Fixed SLIDE_HEIGHT = Fixed.FromFloat(0.4f);         // Reduced hitbox Y
        private static readonly Fixed RUNNER_HALF_WIDTH = Fixed.FromFloat(0.35f);
        private static readonly Fixed RUNNER_HALF_HEIGHT = Fixed.FromFloat(0.9f);
        private static readonly Fixed RUNNER_HALF_DEPTH = Fixed.FromFloat(0.3f);

        // Near-miss detection
        private static readonly Fixed NEAR_MISS_RANGE = Fixed.FromFloat(0.8f);
        private static readonly Fixed PERFECT_DODGE_RANGE = Fixed.FromFloat(0.3f);

        // ─── State ──────────────────────────────────────────────

        private RunnerState _state;
        private readonly DifficultyManager _difficulty;

        public RunnerState State => _state;

        public RunnerSimulation(DifficultyManager difficulty, int startingLives)
        {
            _difficulty = difficulty;
            _state = new RunnerState
            {
                CurrentLane = Lane.Center,
                TargetLane = Lane.Center,
                Vertical = VerticalState.Running,
                Position = new FixedVec3(Fixed.Zero, RUNNER_HALF_HEIGHT, Fixed.Zero),
                Speed = Fixed.Zero,
                JumpProgress = Fixed.Zero,
                SlideProgress = Fixed.Zero,
                LaneSwitchProgress = Fixed.One,
                IsAlive = true,
                Lives = startingLives,
                CurrentTick = 0,
                TotalDistance = Fixed.Zero,
            };
        }

        // ─── Input Processing ───────────────────────────────────

        public void ProcessInput(InputAction action)
        {
            if (!_state.IsAlive) return;

            switch (action)
            {
                case InputAction.LaneLeft:
                    if (_state.TargetLane > Lane.Left)
                    {
                        _state.CurrentLane = _state.TargetLane;
                        _state.TargetLane = (Lane)((int)_state.TargetLane - 1);
                        _state.LaneSwitchProgress = Fixed.Zero;
                    }
                    break;

                case InputAction.LaneRight:
                    if (_state.TargetLane < Lane.Right)
                    {
                        _state.CurrentLane = _state.TargetLane;
                        _state.TargetLane = (Lane)((int)_state.TargetLane + 1);
                        _state.LaneSwitchProgress = Fixed.Zero;
                    }
                    break;

                case InputAction.Jump:
                    if (_state.Vertical == VerticalState.Running)
                    {
                        _state.Vertical = VerticalState.Jumping;
                        _state.JumpProgress = Fixed.Zero;
                    }
                    break;

                case InputAction.Slide:
                    if (_state.Vertical == VerticalState.Running)
                    {
                        _state.Vertical = VerticalState.Sliding;
                        _state.SlideProgress = Fixed.Zero;
                    }
                    break;
            }
        }

        // ─── Tick Update ────────────────────────────────────────

        /// <summary>
        /// Advance runner simulation by one tick.
        /// Returns near-miss result if applicable.
        /// </summary>
        public NearMissResult Tick(ObstacleSpawner spawner)
        {
            if (!_state.IsAlive) return default;

            _state.CurrentTick++;

            // Update speed
            _state.Speed = _difficulty.GetSpeed(_state.CurrentTick);

            // Move forward
            _state.Position = new FixedVec3(
                _state.Position.X,
                _state.Position.Y,
                _state.Position.Z + _state.Speed
            );
            _state.TotalDistance = _state.TotalDistance + _state.Speed;

            // Update lane position
            UpdateLanePosition();

            // Update vertical state
            UpdateVerticalState();

            // Collision detection
            return CheckCollisions(spawner);
        }

        // ─── Lane Movement ──────────────────────────────────────

        private void UpdateLanePosition()
        {
            if (_state.LaneSwitchProgress < Fixed.One)
            {
                _state.LaneSwitchProgress = _state.LaneSwitchProgress + LANE_SWITCH_SPEED;
                if (_state.LaneSwitchProgress > Fixed.One)
                    _state.LaneSwitchProgress = Fixed.One;
            }

            // Interpolate X position between lanes
            Fixed fromX = ObstacleSpawner.GetLaneX(_state.CurrentLane);
            Fixed toX = ObstacleSpawner.GetLaneX(_state.TargetLane);
            Fixed x = Fixed.Lerp(fromX, toX, _state.LaneSwitchProgress);

            _state.Position = new FixedVec3(x, _state.Position.Y, _state.Position.Z);
        }

        // ─── Vertical Movement ──────────────────────────────────

        private void UpdateVerticalState()
        {
            switch (_state.Vertical)
            {
                case VerticalState.Jumping:
                    _state.JumpProgress = _state.JumpProgress + Fixed.One / JUMP_DURATION_TICKS;

                    if (_state.JumpProgress >= Fixed.One)
                    {
                        _state.JumpProgress = Fixed.Zero;
                        _state.Vertical = VerticalState.Running;
                        _state.Position = new FixedVec3(
                            _state.Position.X,
                            RUNNER_HALF_HEIGHT,
                            _state.Position.Z
                        );
                    }
                    else
                    {
                        // Parabolic arc: y = 4h * t * (1 - t)
                        Fixed t = _state.JumpProgress;
                        Fixed arc = Fixed.FromInt(4) * JUMP_HEIGHT * t * (Fixed.One - t);
                        _state.Position = new FixedVec3(
                            _state.Position.X,
                            RUNNER_HALF_HEIGHT + arc,
                            _state.Position.Z
                        );
                    }
                    break;

                case VerticalState.Sliding:
                    _state.SlideProgress = _state.SlideProgress + Fixed.One / SLIDE_DURATION_TICKS;

                    if (_state.SlideProgress >= Fixed.One)
                    {
                        _state.SlideProgress = Fixed.Zero;
                        _state.Vertical = VerticalState.Running;
                        _state.Position = new FixedVec3(
                            _state.Position.X,
                            RUNNER_HALF_HEIGHT,
                            _state.Position.Z
                        );
                    }
                    else
                    {
                        _state.Position = new FixedVec3(
                            _state.Position.X,
                            SLIDE_HEIGHT,
                            _state.Position.Z
                        );
                    }
                    break;

                case VerticalState.Running:
                    _state.Position = new FixedVec3(
                        _state.Position.X,
                        RUNNER_HALF_HEIGHT,
                        _state.Position.Z
                    );
                    break;
            }
        }

        // ─── Collision & Near-Miss ──────────────────────────────

        private NearMissResult CheckCollisions(ObstacleSpawner spawner)
        {
            NearMissResult nearMiss = default;
            Fixed closestDist = Fixed.MaxValue;

            // Runner hitbox (reduced during slide)
            Fixed halfH = _state.Vertical == VerticalState.Sliding
                ? Fixed.FromFloat(0.2f) : RUNNER_HALF_HEIGHT;
            FixedVec3 runnerHalf = new FixedVec3(RUNNER_HALF_WIDTH, halfH, RUNNER_HALF_DEPTH);
            AABB runnerBox = new AABB(_state.Position, runnerHalf);

            Fixed nearMissThreshold = _difficulty.GetNearMissThreshold(_state.CurrentTick);

            var obstacles = spawner.Obstacles;
            for (int i = 0; i < obstacles.Count; i++)
            {
                var obs = obstacles[i];
                if (!obs.IsActive) continue;

                // Only check obstacles near the runner in Z
                Fixed dz = Fixed.Abs(obs.Position.Z - _state.Position.Z);
                if (dz > Fixed.FromFloat(5.0f)) continue;

                AABB obsBox = obs.GetAABB();

                // Collision check
                if (AABB.Intersects(runnerBox, obsBox))
                {
                    HandleCollision();
                    return nearMiss;
                }

                // Near-miss check (obstacle just passed)
                if (obs.Position.Z < _state.Position.Z &&
                    obs.Position.Z > _state.Position.Z - Fixed.FromFloat(2.0f))
                {
                    Fixed sqDist = obsBox.SqrDistanceToPoint(_state.Position);
                    if (sqDist < closestDist)
                    {
                        closestDist = sqDist;
                        Fixed dist = Fixed.Sqrt(sqDist);

                        if (dist < nearMissThreshold)
                        {
                            bool isPerfect = dist < PERFECT_DODGE_RANGE;
                            nearMiss = new NearMissResult
                            {
                                Occurred = true,
                                ClosestDistance = dist,
                                ObstacleId = obs.Id,
                                IsPerfectDodge = isPerfect,
                            };
                        }
                    }
                }
            }

            return nearMiss;
        }

        private void HandleCollision()
        {
            _state.Lives--;
            if (_state.Lives <= 0)
            {
                _state.IsAlive = false;
            }
        }

        // ─── Queries ────────────────────────────────────────────

        public AABB GetRunnerAABB()
        {
            Fixed halfH = _state.Vertical == VerticalState.Sliding
                ? Fixed.FromFloat(0.2f) : RUNNER_HALF_HEIGHT;
            return new AABB(_state.Position, new FixedVec3(RUNNER_HALF_WIDTH, halfH, RUNNER_HALF_DEPTH));
        }

        public void Reset(int startingLives)
        {
            _state = new RunnerState
            {
                CurrentLane = Lane.Center,
                TargetLane = Lane.Center,
                Vertical = VerticalState.Running,
                Position = new FixedVec3(Fixed.Zero, RUNNER_HALF_HEIGHT, Fixed.Zero),
                Speed = Fixed.Zero,
                JumpProgress = Fixed.Zero,
                SlideProgress = Fixed.Zero,
                LaneSwitchProgress = Fixed.One,
                IsAlive = true,
                Lives = startingLives,
                CurrentTick = 0,
                TotalDistance = Fixed.Zero,
            };
        }
    }
}
