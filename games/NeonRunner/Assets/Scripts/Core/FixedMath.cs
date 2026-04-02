using System;
using System.Runtime.CompilerServices;

namespace NeonRunner.Core
{
    /// <summary>
    /// Fixed-point math utilities for deterministic simulation.
    /// Uses Q16.16 format (32-bit integer with 16 fractional bits).
    /// Guarantees identical results across all platforms and devices.
    /// </summary>
    public struct Fixed : IEquatable<Fixed>, IComparable<Fixed>
    {
        public const int FRACTIONAL_BITS = 16;
        public const int ONE = 1 << FRACTIONAL_BITS; // 65536
        public const int HALF = ONE >> 1;             // 32768

        public long RawValue;

        // ─── Constructors ───────────────────────────────────────

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public Fixed(long raw) { RawValue = raw; }

        public static Fixed FromInt(int value) => new Fixed((long)value << FRACTIONAL_BITS);
        public static Fixed FromFloat(float value) => new Fixed((long)(value * ONE));
        public static Fixed FromDouble(double value) => new Fixed((long)(value * ONE));

        // ─── Constants ──────────────────────────────────────────

        public static readonly Fixed Zero = new Fixed(0);
        public static readonly Fixed One = FromInt(1);
        public static readonly Fixed Two = FromInt(2);
        public static readonly Fixed Three = FromInt(3);
        public static readonly Fixed Half = new Fixed(HALF);
        public static readonly Fixed Quarter = new Fixed(ONE >> 2);
        public static readonly Fixed Tenth = FromFloat(0.1f);
        public static readonly Fixed Pi = FromFloat(3.14159265f);
        public static readonly Fixed MaxValue = new Fixed(long.MaxValue >> 1);
        public static readonly Fixed MinValue = new Fixed(long.MinValue >> 1);

        // ─── Conversions ────────────────────────────────────────

        public int ToInt() => (int)(RawValue >> FRACTIONAL_BITS);
        public float ToFloat() => (float)RawValue / ONE;
        public double ToDouble() => (double)RawValue / ONE;

        // ─── Arithmetic ─────────────────────────────────────────

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static Fixed operator +(Fixed a, Fixed b) => new Fixed(a.RawValue + b.RawValue);

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static Fixed operator -(Fixed a, Fixed b) => new Fixed(a.RawValue - b.RawValue);

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static Fixed operator -(Fixed a) => new Fixed(-a.RawValue);

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static Fixed operator *(Fixed a, Fixed b) =>
            new Fixed((a.RawValue * b.RawValue) >> FRACTIONAL_BITS);

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static Fixed operator /(Fixed a, Fixed b)
        {
            if (b.RawValue == 0) throw new DivideByZeroException();
            return new Fixed((a.RawValue << FRACTIONAL_BITS) / b.RawValue);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static Fixed operator %(Fixed a, Fixed b) => new Fixed(a.RawValue % b.RawValue);

        // ─── Comparison ─────────────────────────────────────────

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool operator ==(Fixed a, Fixed b) => a.RawValue == b.RawValue;
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool operator !=(Fixed a, Fixed b) => a.RawValue != b.RawValue;
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool operator <(Fixed a, Fixed b) => a.RawValue < b.RawValue;
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool operator >(Fixed a, Fixed b) => a.RawValue > b.RawValue;
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool operator <=(Fixed a, Fixed b) => a.RawValue <= b.RawValue;
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool operator >=(Fixed a, Fixed b) => a.RawValue >= b.RawValue;

        // ─── Math Functions ─────────────────────────────────────

        public static Fixed Abs(Fixed v) => new Fixed(Math.Abs(v.RawValue));

        public static Fixed Min(Fixed a, Fixed b) => a.RawValue < b.RawValue ? a : b;
        public static Fixed Max(Fixed a, Fixed b) => a.RawValue > b.RawValue ? a : b;

        public static Fixed Clamp(Fixed value, Fixed min, Fixed max)
        {
            if (value < min) return min;
            if (value > max) return max;
            return value;
        }

        public static Fixed Floor(Fixed v) => new Fixed(v.RawValue & ~(long)(ONE - 1));
        public static Fixed Ceil(Fixed v)
        {
            long frac = v.RawValue & (ONE - 1);
            return frac == 0 ? v : new Fixed((v.RawValue & ~(long)(ONE - 1)) + ONE);
        }

        /// <summary>
        /// Linear interpolation: a + (b - a) * t
        /// </summary>
        public static Fixed Lerp(Fixed a, Fixed b, Fixed t)
        {
            t = Clamp(t, Zero, One);
            return a + (b - a) * t;
        }

        /// <summary>
        /// Integer square root approximation via Newton's method.
        /// Deterministic across platforms.
        /// </summary>
        public static Fixed Sqrt(Fixed v)
        {
            if (v.RawValue <= 0) return Zero;

            // Initial guess
            long val = v.RawValue << FRACTIONAL_BITS;
            long guess = v.RawValue;
            if (guess == 0) return Zero;

            // Newton iterations
            for (int i = 0; i < 16; i++)
            {
                long next = (guess + val / guess) >> 1;
                if (next >= guess) break;
                guess = next;
            }

            return new Fixed(guess);
        }

        // ─── Implicit Conversions ───────────────────────────────

        public static implicit operator Fixed(int v) => FromInt(v);

        // ─── Object Overrides ───────────────────────────────────

        public override bool Equals(object obj) => obj is Fixed f && f.RawValue == RawValue;
        public bool Equals(Fixed other) => RawValue == other.RawValue;
        public override int GetHashCode() => RawValue.GetHashCode();
        public int CompareTo(Fixed other) => RawValue.CompareTo(other.RawValue);
        public override string ToString() => ToFloat().ToString("F3");
    }

    /// <summary>
    /// Deterministic 3D vector using Fixed-point math.
    /// </summary>
    public struct FixedVec3 : IEquatable<FixedVec3>
    {
        public Fixed X, Y, Z;

        public FixedVec3(Fixed x, Fixed y, Fixed z) { X = x; Y = y; Z = z; }
        public FixedVec3(int x, int y, int z) { X = Fixed.FromInt(x); Y = Fixed.FromInt(y); Z = Fixed.FromInt(z); }

        public static readonly FixedVec3 Zero = new FixedVec3(Fixed.Zero, Fixed.Zero, Fixed.Zero);
        public static readonly FixedVec3 One = new FixedVec3(Fixed.One, Fixed.One, Fixed.One);
        public static readonly FixedVec3 Forward = new FixedVec3(Fixed.Zero, Fixed.Zero, Fixed.One);
        public static readonly FixedVec3 Up = new FixedVec3(Fixed.Zero, Fixed.One, Fixed.Zero);

        public static FixedVec3 operator +(FixedVec3 a, FixedVec3 b) =>
            new FixedVec3(a.X + b.X, a.Y + b.Y, a.Z + b.Z);

        public static FixedVec3 operator -(FixedVec3 a, FixedVec3 b) =>
            new FixedVec3(a.X - b.X, a.Y - b.Y, a.Z - b.Z);

        public static FixedVec3 operator *(FixedVec3 v, Fixed s) =>
            new FixedVec3(v.X * s, v.Y * s, v.Z * s);

        public static FixedVec3 operator *(Fixed s, FixedVec3 v) => v * s;

        public Fixed SqrMagnitude => X * X + Y * Y + Z * Z;
        public Fixed Magnitude => Fixed.Sqrt(SqrMagnitude);

        public static Fixed Distance(FixedVec3 a, FixedVec3 b) => (a - b).Magnitude;

        public bool Equals(FixedVec3 other) => X == other.X && Y == other.Y && Z == other.Z;
        public override bool Equals(object obj) => obj is FixedVec3 v && Equals(v);
        public override int GetHashCode() => X.GetHashCode() ^ (Y.GetHashCode() << 8) ^ (Z.GetHashCode() << 16);
        public static bool operator ==(FixedVec3 a, FixedVec3 b) => a.Equals(b);
        public static bool operator !=(FixedVec3 a, FixedVec3 b) => !a.Equals(b);

        public UnityEngine.Vector3 ToVector3() => new UnityEngine.Vector3(X.ToFloat(), Y.ToFloat(), Z.ToFloat());

        public override string ToString() => $"({X}, {Y}, {Z})";
    }

    /// <summary>
    /// Axis-Aligned Bounding Box for deterministic collision.
    /// </summary>
    public struct AABB
    {
        public FixedVec3 Min;
        public FixedVec3 Max;

        public AABB(FixedVec3 center, FixedVec3 halfExtents)
        {
            Min = center - halfExtents;
            Max = center + halfExtents;
        }

        public static bool Intersects(AABB a, AABB b)
        {
            return a.Min.X <= b.Max.X && a.Max.X >= b.Min.X
                && a.Min.Y <= b.Max.Y && a.Max.Y >= b.Min.Y
                && a.Min.Z <= b.Max.Z && a.Max.Z >= b.Min.Z;
        }

        /// <summary>
        /// Returns squared distance from the closest point on the AABB surface.
        /// Zero if point is inside.
        /// </summary>
        public Fixed SqrDistanceToPoint(FixedVec3 point)
        {
            Fixed dx = Fixed.Max(Fixed.Max(Min.X - point.X, point.X - Max.X), Fixed.Zero);
            Fixed dy = Fixed.Max(Fixed.Max(Min.Y - point.Y, point.Y - Max.Y), Fixed.Zero);
            Fixed dz = Fixed.Max(Fixed.Max(Min.Z - point.Z, point.Z - Max.Z), Fixed.Zero);
            return dx * dx + dy * dy + dz * dz;
        }
    }
}
