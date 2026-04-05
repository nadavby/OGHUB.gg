import type { GameInput, GameEvent } from './types';

interface RecordedInput {
  name: string;
  data?: Record<string, unknown>;
  timestamp: number;
  sequence: number;
}

interface BufferedEvent {
  eventType: string;
  payload: Record<string, unknown>;
  timestamp: number;
  sequence: number;
}

export class EventReporter {
  private eventBuffer: BufferedEvent[] = [];
  private inputTimeline: RecordedInput[] = [];
  private sequenceCounter = 0;
  private startTime = 0;
  private flushCallback: ((events: BufferedEvent[]) => Promise<void>) | null = null;
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  start(flushCallback: (events: BufferedEvent[]) => Promise<void>): void {
    this.startTime = Date.now();
    this.sequenceCounter = 0;
    this.inputTimeline = [];
    this.eventBuffer = [];
    this.flushCallback = flushCallback;

    this.flushInterval = setInterval(() => {
      this.flush();
    }, 2000);
  }

  recordInput(input: GameInput): void {
    const seq = this.sequenceCounter++;
    const timestamp = Date.now() - this.startTime;

    this.inputTimeline.push({
      name: input.name,
      data: input.data,
      timestamp,
      sequence: seq,
    });

    this.eventBuffer.push({
      eventType: `input:${input.name}`,
      payload: input.data ?? {},
      timestamp: Date.now(),
      sequence: seq,
    });

    if (this.eventBuffer.length >= 50) {
      this.flush();
    }
  }

  recordEvent(event: GameEvent): void {
    this.eventBuffer.push({
      eventType: event.type,
      payload: event.data ?? {},
      timestamp: Date.now(),
      sequence: this.sequenceCounter++,
    });
  }

  async flush(): Promise<void> {
    if (this.eventBuffer.length === 0 || !this.flushCallback) return;
    const events = [...this.eventBuffer];
    this.eventBuffer = [];
    try {
      await this.flushCallback(events);
    } catch {
      this.eventBuffer = [...events, ...this.eventBuffer];
    }
  }

  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  getInputTimeline(): RecordedInput[] {
    return [...this.inputTimeline];
  }

  getDuration(): number {
    return Date.now() - this.startTime;
  }

  reset(): void {
    this.stop();
    this.eventBuffer = [];
    this.inputTimeline = [];
    this.sequenceCounter = 0;
    this.startTime = 0;
    this.flushCallback = null;
  }
}
