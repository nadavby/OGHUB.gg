// ─── API Response Types ─────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ─── Auth ───────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: 'PLAYER' | 'DEVELOPER' | 'ADMIN';
}

// ─── Wallet ─────────────────────────────────────────────────

export interface WalletBalance {
  balance: string;
  frozenBalance: string;
  currency: string;
}

export interface TransactionRecord {
  id: string;
  type: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  description: string | null;
  createdAt: string;
}

// ─── Games ──────────────────────────────────────────────────

export interface GameCard {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  difficulty: number;
  tags: string[];
  isFeatured: boolean;
  topScore?: number;
  activeChallenges: number;
}

export interface GameDetail extends GameCard {
  deepLinkScheme: string | null;
  minPlayers: number;
  maxPlayers: number;
  challenges: ChallengeInfo[];
}

// ─── Challenges ─────────────────────────────────────────────

export interface ChallengeInfo {
  id: string;
  title: string;
  description: string | null;
  entryFee: string;
  prizePool: string;
  maxEntries: number | null;
  currentEntries: number;
  startsAt: string | null;
  endsAt: string | null;
  status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
}

// ─── Sessions ───────────────────────────────────────────────

export interface CreateSessionRequest {
  gameId: string;
  challengeId?: string;
}

export interface SessionConfig {
  sessionId: string;
  token: string;
  seed: string;
  modifiers: Record<string, unknown>;
  expiresAt: string;
  ghostData?: GhostReplay | null;
}

export interface EndSessionRequest {
  score: number;
  replayData: ReplayData;
  metadata?: Record<string, unknown>;
}

export interface SessionOutcome {
  accepted: boolean;
  score: number;
  rank?: number;
  reward?: string;
  nearMiss?: NearMissInfo | null;
}

// ─── Replay / Ghost ─────────────────────────────────────────

export interface ReplayData {
  seed: string;
  inputTimeline: InputEvent[];
  duration: number;
}

export interface InputEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
  sequence: number;
}

export interface GhostReplay {
  seed: string;
  inputTimeline: InputEvent[];
  duration: number;
  playerName: string;
  score: number;
}

// ─── Leaderboard ────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  score: number;
  playedAt: string;
}

export interface NearMissInfo {
  message: string;
  targetRank: number;
  targetScore: number;
  difference: number;
  percentile: number;
}

// ─── SDK Events ─────────────────────────────────────────────

export interface GameplayEvent {
  sessionId: string;
  eventType: string;
  payload: Record<string, unknown>;
  timestamp: number;
  sequence: number;
}

// ─── SDK Config ─────────────────────────────────────────────

export interface SDKConfig {
  apiUrl: string;
  appKey: string;
  appSecret: string;
}

// ─── Game Definition Protocol ──────────────────────────────

export type TrustTier = 'basic' | 'standard' | 'verified';
export type InputType = 'action' | 'vector2' | 'vector3' | 'scalar' | 'toggle';
export type ScoringMethod = 'accumulative' | 'time_based' | 'objective_based' | 'custom';

export interface InputDefinition {
  name: string;
  type: InputType;
  metadata?: Record<string, string>;
}

export interface ScoringDefinition {
  range: [number, number];
  method: ScoringMethod;
  components?: Array<{ name: string; weight: number }>;
}

export interface SessionRules {
  maxDuration: number;    // seconds
  minDuration: number;    // seconds
  allowPause: boolean;
  lives?: number;
}

export interface AnticheatConfig {
  maxInputRate: number;          // per second
  minReactionTime: number;       // ms
  maxScorePerSecond: number;
  customRules?: Array<{
    name: string;
    condition: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
}

export interface ValidationConfig {
  snapshotInterval: number;      // seconds
  requiredFields: string[];
}

export interface GameDefinition {
  name: string;
  slug: string;
  version: string;
  engine: string;
  inputs: InputDefinition[];
  scoring: ScoringDefinition;
  session: SessionRules;
  anticheat: AnticheatConfig;
  trust: {
    tier: TrustTier;
    replayFormat?: string;
    replaySimulator?: string;
  };
  validation?: ValidationConfig;
}

// ─── Live Validation (WebSocket) ───────────────────────────

export interface StateSnapshot {
  [key: string]: unknown;
}

export interface ValidationRequest {
  type: 'validation_request';
  requestId: string;
  timestamp: number;
}

export interface ValidationResponse {
  type: 'validation_response';
  requestId: string;
  state: StateSnapshot;
}

export interface ScoreUpdate {
  type: 'score_update';
  score: number;
  hash: string;
  sequence: number;
}

export interface LeaderboardUpdate {
  type: 'leaderboard_update';
  entries: LeaderboardEntry[];
}

// ─── Trust Tier Limits ─────────────────────────────────────

export const TRUST_TIER_LIMITS: Record<TrustTier, { maxPrizePool: number }> = {
  basic: { maxPrizePool: 50 },
  standard: { maxPrizePool: 1000 },
  verified: { maxPrizePool: Infinity },
};
