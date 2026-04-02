using System;

namespace NeonRunner.Core
{
    /// <summary>
    /// Xoshiro256** deterministic PRNG.
    /// Given the same seed, produces identical sequence on every platform.
    /// Every call to Next() advances the state exactly once — order matters.
    /// </summary>
    public sealed class DeterministicRNG
    {
        private ulong _s0, _s1, _s2, _s3;

        public DeterministicRNG(long seed)
        {
            // SplitMix64 to initialize state from seed
            ulong s = (ulong)seed;
            _s0 = SplitMix64(ref s);
            _s1 = SplitMix64(ref s);
            _s2 = SplitMix64(ref s);
            _s3 = SplitMix64(ref s);

            // Guard against all-zero state
            if ((_s0 | _s1 | _s2 | _s3) == 0)
                _s0 = 1;
        }

        /// <summary>
        /// Fork this RNG into an independent stream.
        /// Useful for sub-systems that need their own deterministic sequence.
        /// </summary>
        public DeterministicRNG Fork()
        {
            var forked = new DeterministicRNG(0);
            forked._s0 = NextRaw();
            forked._s1 = NextRaw();
            forked._s2 = NextRaw();
            forked._s3 = NextRaw();
            return forked;
        }

        // ─── Core ───────────────────────────────────────────────

        /// <summary>
        /// Returns next raw 64-bit value. Advances state.
        /// </summary>
        public ulong NextRaw()
        {
            ulong result = RotateLeft(_s1 * 5, 7) * 9;
            ulong t = _s1 << 17;

            _s2 ^= _s0;
            _s3 ^= _s1;
            _s1 ^= _s2;
            _s0 ^= _s3;

            _s2 ^= t;
            _s3 = RotateLeft(_s3, 45);

            return result;
        }

        // ─── Integer Ranges ─────────────────────────────────────

        /// <summary>
        /// Returns integer in [0, max) range.
        /// </summary>
        public int Next(int max)
        {
            if (max <= 0) return 0;
            return (int)(NextRaw() % (ulong)max);
        }

        /// <summary>
        /// Returns integer in [min, max) range.
        /// </summary>
        public int Next(int min, int max)
        {
            if (min >= max) return min;
            return min + Next(max - min);
        }

        // ─── Fixed-Point ────────────────────────────────────────

        /// <summary>
        /// Returns Fixed value in [0, 1) range.
        /// </summary>
        public Fixed NextFixed()
        {
            // Use top 16 bits for Q16.16 fractional part
            long frac = (long)(NextRaw() >> 48); // 0–65535
            return new Fixed(frac);
        }

        /// <summary>
        /// Returns Fixed value in [min, max) range.
        /// </summary>
        public Fixed NextFixed(Fixed min, Fixed max)
        {
            if (min >= max) return min;
            Fixed range = max - min;
            return min + NextFixed() * range;
        }

        // ─── Boolean ────────────────────────────────────────────

        /// <summary>
        /// Returns true with the given probability [0, 1).
        /// </summary>
        public bool NextBool(Fixed probability)
        {
            return NextFixed() < probability;
        }

        public bool NextBool()
        {
            return (NextRaw() & 1) == 0;
        }

        // ─── Utility ────────────────────────────────────────────

        /// <summary>
        /// Shuffle an array in-place deterministically.
        /// </summary>
        public void Shuffle<T>(T[] array)
        {
            for (int i = array.Length - 1; i > 0; i--)
            {
                int j = Next(i + 1);
                T temp = array[i];
                array[i] = array[j];
                array[j] = temp;
            }
        }

        /// <summary>
        /// Pick a random element from an array.
        /// </summary>
        public T Pick<T>(T[] array)
        {
            return array[Next(array.Length)];
        }

        // ─── Helpers ────────────────────────────────────────────

        private static ulong RotateLeft(ulong x, int k) =>
            (x << k) | (x >> (64 - k));

        private static ulong SplitMix64(ref ulong state)
        {
            ulong z = state += 0x9e3779b97f4a7c15UL;
            z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9UL;
            z = (z ^ (z >> 27)) * 0x94d049bb133111ebUL;
            return z ^ (z >> 31);
        }

        // ─── State Snapshot (for debugging) ─────────────────────

        public ulong[] GetState() => new[] { _s0, _s1, _s2, _s3 };

        public void SetState(ulong[] state)
        {
            _s0 = state[0];
            _s1 = state[1];
            _s2 = state[2];
            _s3 = state[3];
        }
    }
}
