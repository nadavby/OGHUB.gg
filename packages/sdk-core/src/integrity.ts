import crypto from 'crypto';

export class IntegrityGuard {
  private apiSecret: string;
  private scoreHashChain: string[] = [];
  private sessionId: string = '';

  constructor(apiSecret: string) {
    this.apiSecret = apiSecret;
  }

  setSessionId(id: string): void {
    this.sessionId = id;
    this.scoreHashChain = [];
  }

  sign(body: string): { signature: string; timestamp: string; nonce: string } {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');
    const payload = `${timestamp}:${nonce}:${body}`;
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(payload)
      .digest('hex');
    return { signature, timestamp, nonce };
  }

  computeScoreHash(score: number, sequence: number): string {
    const previousHash = this.scoreHashChain.length > 0
      ? this.scoreHashChain[this.scoreHashChain.length - 1]
      : this.sessionId;
    const payload = `${previousHash}:${score}:${sequence}`;
    const hash = crypto.createHash('sha256').update(payload).digest('hex');
    this.scoreHashChain.push(hash);
    return hash;
  }

  computeReplayChecksum(inputTimeline: any[]): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(inputTimeline))
      .digest('hex');
  }

  reset(): void {
    this.scoreHashChain = [];
    this.sessionId = '';
  }
}
