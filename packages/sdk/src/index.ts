import crypto from 'crypto';
import type {
  SDKConfig,
  SessionConfig,
  GameplayEvent,
  ReplayData,
  InputEvent,
  GhostReplay,
  SessionOutcome,
} from '@oghub/shared';

export interface GameResult {
  score: number;
  metadata?: Record<string, unknown>;
}

export class OGHubSDK {
  private config: SDKConfig;
  private sessionId: string | null = null;
  private sessionToken: string | null = null;
  private seed: string | null = null;
  private eventBuffer: GameplayEvent[] = [];
  private inputTimeline: InputEvent[] = [];
  private sequenceCounter = 0;
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private startTime: number = 0;

  constructor(config: SDKConfig) {
    this.config = config;
  }

  // ─── Core Lifecycle ─────────────────────────────────────

  /**
   * Initialize a game session with the token received from the hub.
   * Validates with the backend and returns session config including ghost data.
   */
  async initSession(sessionToken: string): Promise<SessionConfig> {
    this.sessionToken = sessionToken;

    // Extract session ID from token (call validate endpoint)
    const response = await this.request(
      'POST',
      `/api/sessions/${this.extractSessionId(sessionToken)}/validate`,
      {},
      sessionToken,
    );

    this.sessionId = response.sessionId;
    this.seed = response.seed;

    return response as SessionConfig;
  }

  /**
   * Start the gameplay session. Sets up event batching.
   */
  async startSession(): Promise<void> {
    if (!this.sessionId) {
      throw new Error('Session not initialized. Call initSession first.');
    }

    this.startTime = Date.now();
    this.sequenceCounter = 0;
    this.inputTimeline = [];
    this.eventBuffer = [];

    // Auto-flush events every 2 seconds
    this.flushInterval = setInterval(() => {
      this.flushEvents();
    }, 2000);
  }

  /**
   * Report a gameplay event. Events are batched and sent periodically.
   */
  reportEvent(type: string, payload: Record<string, unknown> = {}): void {
    if (!this.sessionId) return;

    const event: GameplayEvent = {
      sessionId: this.sessionId,
      eventType: type,
      payload,
      timestamp: Date.now(),
      sequence: this.sequenceCounter++,
    };

    this.eventBuffer.push(event);

    // Also record for replay
    this.inputTimeline.push({
      type,
      data: payload,
      timestamp: Date.now() - this.startTime,
      sequence: event.sequence,
    });

    // Auto-flush if buffer gets large
    if (this.eventBuffer.length >= 50) {
      this.flushEvents();
    }
  }

  /**
   * End the session and submit the final score + replay data.
   */
  async endSession(result: GameResult): Promise<SessionOutcome> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }

    // Stop auto-flush
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Flush remaining events
    await this.flushEvents();

    const replayData: ReplayData = {
      seed: this.seed || '',
      inputTimeline: this.inputTimeline,
      duration: Date.now() - this.startTime,
    };

    const response = await this.request(
      'POST',
      `/api/sessions/${this.sessionId}/end`,
      {
        score: result.score,
        replayData,
        metadata: result.metadata,
      },
      this.sessionToken!,
    );

    // Clean up
    this.sessionId = null;
    this.sessionToken = null;
    this.seed = null;
    this.inputTimeline = [];

    return response as SessionOutcome;
  }

  // ─── Ghost System ───────────────────────────────────────

  /**
   * Request ghost replay data for a challenge.
   */
  async requestGhostData(challengeId: string): Promise<GhostReplay | null> {
    const response = await this.request('GET', `/api/ghosts/${challengeId}/top`);
    return response as GhostReplay | null;
  }

  // ─── Internal ───────────────────────────────────────────

  private async flushEvents(): Promise<void> {
    if (this.eventBuffer.length === 0 || !this.sessionId) return;

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      await this.request(
        'POST',
        `/api/sessions/${this.sessionId}/events`,
        { events },
        this.sessionToken!,
      );
    } catch (err) {
      // Re-add events on failure
      this.eventBuffer = [...events, ...this.eventBuffer];
      console.error('[OGHub SDK] Failed to flush events:', err);
    }
  }

  private sign(body: string): { signature: string; timestamp: string; nonce: string } {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');
    const payload = `${timestamp}:${nonce}:${body}`;
    const signature = crypto
      .createHmac('sha256', this.config.appSecret)
      .update(payload)
      .digest('hex');
    return { signature, timestamp, nonce };
  }

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    bearerToken?: string,
  ): Promise<any> {
    const url = `${this.config.apiUrl}${path}`;
    const bodyStr = body ? JSON.stringify(body) : '{}';
    const { signature, timestamp, nonce } = this.sign(bodyStr);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-oghub-api-key': this.config.appKey,
      'x-oghub-signature': signature,
      'x-oghub-timestamp': timestamp,
      'x-oghub-nonce': nonce,
      'x-oghub-sdk-version': '1.0.0',
    };

    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: method !== 'GET' ? bodyStr : undefined,
    });

    const json = await response.json();

    if (!response.ok || !json.success) {
      throw new Error(json.error || `Request failed: ${response.status}`);
    }

    return json.data;
  }

  private extractSessionId(token: string): string {
    // The session ID is passed separately — for now use a placeholder
    // In production, the hub passes sessionId alongside the token
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString(),
      );
      return payload.sessionId || '';
    } catch {
      return '';
    }
  }
}

export default OGHubSDK;
export type {
  SDKConfig,
  SessionConfig,
  GameplayEvent,
  ReplayData,
  InputEvent,
  GhostReplay,
  SessionOutcome,
} from '@oghub/shared';
