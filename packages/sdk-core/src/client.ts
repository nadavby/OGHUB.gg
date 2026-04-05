import type {
  SDKInitConfig,
  CreateSessionOptions,
  Session,
  SessionResult,
  GameInput,
  GameEvent,
  GhostReplay,
  ValidationRequestHandler,
  LeaderboardUpdateHandler,
  SessionKillHandler,
} from './types';
import { IntegrityGuard } from './integrity';
import { EventReporter } from './events';
import { SDKWebSocket } from './websocket';

export class OGHubSDK {
  private config: SDKInitConfig | null = null;
  private integrity: IntegrityGuard | null = null;
  private events: EventReporter = new EventReporter();
  private websocket: SDKWebSocket = new SDKWebSocket();
  private session: Session | null = null;
  private scoreSequence = 0;
  private lastScore = 0;

  async init(config: SDKInitConfig): Promise<void> {
    this.config = config;
    this.integrity = new IntegrityGuard(config.apiSecret);
  }

  async createSession(options?: CreateSessionOptions): Promise<Session> {
    this.ensureInit();
    const response = await this.request('POST', '/api/sessions/create', {
      gameId: this.config!.gameSlug,
      challengeId: options?.challengeId,
    });

    this.session = {
      id: response.sessionId,
      token: response.token,
      seed: response.seed,
      config: response.modifiers ?? {},
      ghostData: null,
    };

    this.integrity!.setSessionId(this.session.id);

    // Validate session (fetches ghost data)
    const validateResponse = await this.request(
      'POST',
      `/api/sessions/${this.session.id}/validate`,
      {},
      this.session.token,
    );

    if (validateResponse.ghostData) {
      this.session.ghostData = validateResponse.ghostData;
    }

    // Connect WebSocket for live validation
    const wsUrl = this.config!.apiUrl.replace(/^http/, 'ws') + '/api/sessions/live';
    this.websocket.connect(wsUrl, this.session.id, this.session.token);

    return this.session;
  }

  startSession(): void {
    this.ensureSession();
    this.scoreSequence = 0;
    this.lastScore = 0;

    this.events.start(async (events) => {
      await this.request(
        'POST',
        `/api/sessions/${this.session!.id}/events`,
        { events },
        this.session!.token,
      );
    });
  }

  reportInput(input: GameInput): void {
    if (!this.session) return;
    this.events.recordInput(input);
  }

  reportEvent(event: GameEvent): void {
    if (!this.session) return;
    this.events.recordEvent(event);
  }

  updateScore(score: number): void {
    if (!this.session || !this.integrity) return;
    this.lastScore = score;
    const seq = this.scoreSequence++;
    const hash = this.integrity.computeScoreHash(score, seq);
    this.websocket.sendScoreUpdate(score, hash, seq);
  }

  onValidationRequest(handler: ValidationRequestHandler): void {
    this.websocket.onValidationRequest(handler);
  }

  onSessionKill(_handler: SessionKillHandler): void {
    // Hook provided for future use
  }

  onLeaderboardUpdate(handler: LeaderboardUpdateHandler): void {
    this.websocket.onLeaderboardUpdate(handler);
  }

  async getGhostData(challengeId: string): Promise<GhostReplay | null> {
    this.ensureInit();
    try {
      return await this.request('GET', `/api/ghosts/${challengeId}/top`);
    } catch {
      return null;
    }
  }

  async endSession(): Promise<SessionResult> {
    this.ensureSession();

    this.events.stop();
    await this.events.flush();

    const timeline = this.events.getInputTimeline();
    const duration = this.events.getDuration();
    const checksum = this.integrity!.computeReplayChecksum(timeline);

    const response = await this.request(
      'POST',
      `/api/sessions/${this.session!.id}/end`,
      {
        score: this.lastScore,
        replayData: {
          seed: this.session!.seed,
          inputTimeline: timeline,
          duration,
          checksum,
        },
      },
      this.session!.token,
    );

    this.websocket.disconnect();
    this.events.reset();
    this.integrity!.reset();
    this.session = null;

    return response as SessionResult;
  }

  private ensureInit(): void {
    if (!this.config) throw new Error('SDK not initialized. Call init() first.');
  }

  private ensureSession(): void {
    if (!this.session) throw new Error('No active session. Call createSession() first.');
  }

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    bearerToken?: string,
  ): Promise<any> {
    this.ensureInit();
    const url = `${this.config!.apiUrl}${path}`;
    const bodyStr = body ? JSON.stringify(body) : '{}';
    const { signature, timestamp, nonce } = this.integrity!.sign(bodyStr);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-oghub-api-key': this.config!.apiKey,
      'x-oghub-signature': signature,
      'x-oghub-timestamp': timestamp,
      'x-oghub-nonce': nonce,
      'x-oghub-sdk-version': '2.0.0',
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
}
