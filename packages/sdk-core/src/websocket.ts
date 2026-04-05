import type { StateSnapshot, ValidationRequestHandler, LeaderboardUpdateHandler } from './types';

export class SDKWebSocket {
  private ws: WebSocket | null = null;
  private url: string = '';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private validationHandler: ValidationRequestHandler | null = null;
  private leaderboardHandler: LeaderboardUpdateHandler | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private sendQueue: string[] = [];

  connect(wsUrl: string, sessionId: string, token: string): void {
    this.url = `${wsUrl}?sessionId=${sessionId}&token=${token}`;
    this.doConnect();
  }

  private doConnect(): void {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      for (const msg of this.sendQueue) {
        this.ws!.send(msg);
      }
      this.sendQueue = [];
      this.heartbeatInterval = setInterval(() => {
        this.send({ type: 'heartbeat', timestamp: Date.now() });
      }, 15000);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        this.handleMessage(msg);
      } catch {
        // Ignore malformed
      }
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.pow(2, this.reconnectAttempts) * 1000;
        setTimeout(() => this.doConnect(), delay);
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  private handleMessage(msg: any): void {
    switch (msg.type) {
      case 'validation_request':
        if (this.validationHandler) {
          const state = this.validationHandler();
          this.send({
            type: 'validation_response',
            requestId: msg.requestId,
            state,
          });
        }
        break;
      case 'leaderboard_update':
        if (this.leaderboardHandler) {
          this.leaderboardHandler(msg.entries);
        }
        break;
    }
  }

  onValidationRequest(handler: ValidationRequestHandler): void {
    this.validationHandler = handler;
  }

  onLeaderboardUpdate(handler: LeaderboardUpdateHandler): void {
    this.leaderboardHandler = handler;
  }

  sendScoreUpdate(score: number, hash: string, sequence: number): void {
    this.send({ type: 'score_update', score, hash, sequence });
  }

  send(msg: any): void {
    const data = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      this.sendQueue.push(data);
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.maxReconnectAttempts = 0;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.sendQueue = [];
  }
}
