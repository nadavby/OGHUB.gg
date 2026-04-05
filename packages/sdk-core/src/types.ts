export interface SDKInitConfig {
  apiKey: string;
  apiSecret: string;
  gameSlug: string;
  apiUrl: string;
  environment?: 'production' | 'sandbox';
}

export interface CreateSessionOptions {
  challengeId?: string;
  metadata?: Record<string, unknown>;
}

export interface Session {
  id: string;
  token: string;
  seed: string;
  config: Record<string, unknown>;
  ghostData?: GhostReplay | null;
}

export interface SessionResult {
  accepted: boolean;
  score: number;
  rank?: number | null;
  nearMiss?: NearMissInfo | null;
  reason?: string;
}

export interface GameInput {
  name: string;
  data?: Record<string, unknown>;
}

export interface GameEvent {
  type: string;
  data?: Record<string, unknown>;
}

export interface GhostReplay {
  seed: string;
  inputTimeline: any[];
  duration: number;
  playerName: string;
  score: number;
}

export interface NearMissInfo {
  message: string;
  targetRank: number;
  targetScore: number;
  difference: number;
  percentile: number;
}

export interface StateSnapshot {
  [key: string]: unknown;
}

export type ValidationRequestHandler = () => StateSnapshot;
export type SessionKillHandler = (reason: string) => void;
export type LeaderboardUpdateHandler = (entries: any[]) => void;
