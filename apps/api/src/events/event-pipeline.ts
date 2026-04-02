/**
 * Scalable Event Ingestion Pipeline
 * 
 * Designed for millions of events per minute:
 * 
 * Architecture:
 * ┌────────┐     ┌───────────┐     ┌──────────┐     ┌────────────┐
 * │  SDK   │────▶│  Gateway  │────▶│  Redis   │────▶│  Workers   │
 * │        │     │  (API)    │     │  Streams │     │  (Drain)   │
 * └────────┘     └───────────┘     └──────────┘     └──────┬─────┘
 *                                                          │
 *                                       ┌──────────────────┼──────┐
 *                                       ▼                  ▼      ▼
 *                                  ┌──────────┐     ┌──────┐  ┌──────┐
 *                                  │ Postgres │     │Fraud │  │ Real │
 *                                  │ (bulk)   │     │Engine│  │ time │
 *                                  └──────────┘     └──────┘  └──────┘
 * 
 * Key features:
 * - Redis Streams for ordered, persistent event queue
 * - Consumer groups for parallel processing
 * - Backpressure via stream length limits
 * - Batch DB writes (1000 events per batch)
 * - Dead letter queue for failed processing
 * - Circuit breaker for downstream failures
 */

import { redis, prisma } from '../main';

// ─── Configuration ──────────────────────────────────────────

const STREAM_KEY = 'events:stream';
const CONSUMER_GROUP = 'event_processors';
const DLQ_KEY = 'events:dlq';
const BATCH_SIZE = 1000;
const MAX_STREAM_LENGTH = 1_000_000;       // Cap stream at 1M entries
const DRAIN_INTERVAL_MS = 100;              // Process every 100ms
const MAX_RETRIES = 3;
const CIRCUIT_BREAKER_THRESHOLD = 10;       // Consecutive failures to trip
const CIRCUIT_BREAKER_RESET_MS = 30_000;    // Reset after 30s

// ─── Circuit Breaker ────────────────────────────────────────

class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  isOpen(): boolean {
    if (this.state === 'OPEN') {
      // Check if we should try again
      if (Date.now() - this.lastFailure > CIRCUIT_BREAKER_RESET_MS) {
        this.state = 'HALF_OPEN';
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      this.state = 'OPEN';
      console.error(`[EventPipeline] Circuit breaker OPENED after ${this.failures} consecutive failures`);
    }
  }

  getState(): string {
    return this.state;
  }
}

const dbCircuitBreaker = new CircuitBreaker();

// ─── Event Producer (called from API route) ─────────────────

/**
 * Enqueue events into Redis Streams with zero-latency response.
 * This is what the API endpoint calls instead of direct DB writes.
 */
export async function enqueueEvents(
  sessionId: string,
  events: Array<{
    eventType: string;
    payload: Record<string, unknown>;
    timestamp: number;
    sequence: number;
  }>,
): Promise<{ queued: number; streamLength: number }> {
  const pipeline = redis.pipeline();

  for (const event of events) {
    pipeline.xadd(
      STREAM_KEY,
      'MAXLEN', '~', MAX_STREAM_LENGTH.toString(),
      '*',
      'sessionId', sessionId,
      'eventType', event.eventType,
      'payload', JSON.stringify(event.payload),
      'timestamp', event.timestamp.toString(),
      'sequence', event.sequence.toString(),
      'enqueuedAt', Date.now().toString(),
    );
  }

  const results = await pipeline.exec();
  const streamLength = await redis.xlen(STREAM_KEY);

  // Update ingestion counter for monitoring
  await redis.incrby('metrics:events_ingested', events.length);

  return { queued: events.length, streamLength };
}

// ─── Backpressure Check ─────────────────────────────────────

/**
 * Check if the system can accept more events.
 * Returns backpressure info for the API to decide.
 */
export async function getBackpressure(): Promise<{
  accept: boolean;
  streamLength: number;
  utilization: number;
}> {
  const streamLength = await redis.xlen(STREAM_KEY);
  const utilization = streamLength / MAX_STREAM_LENGTH;

  return {
    accept: utilization < 0.9, // Reject at 90% capacity
    streamLength,
    utilization,
  };
}

// ─── Event Consumer (Background Worker) ─────────────────────

/**
 * Start the event drain worker.
 * In production, run multiple instances with different consumer names.
 */
export async function startEventDrainWorker(
  consumerName: string = 'worker-1',
): Promise<void> {
  // Create consumer group if not exists
  try {
    await redis.xgroup('CREATE', STREAM_KEY, CONSUMER_GROUP, '0', 'MKSTREAM');
    console.log(`[EventPipeline] Created consumer group: ${CONSUMER_GROUP}`);
  } catch (err: any) {
    if (!err.message?.includes('BUSYGROUP')) throw err;
    // Group already exists
  }

  console.log(`[EventPipeline] Worker "${consumerName}" started, draining every ${DRAIN_INTERVAL_MS}ms`);

  // Start drain loop
  const drain = async () => {
    try {
      if (dbCircuitBreaker.isOpen()) {
        console.warn(`[EventPipeline] Circuit breaker OPEN, skipping drain`);
        return;
      }

      // Read batch from stream
      const entries = await redis.xreadgroup(
        'GROUP', CONSUMER_GROUP, consumerName,
        'COUNT', BATCH_SIZE.toString(),
        'BLOCK', '0', // Don't block, return immediately
        'STREAMS', STREAM_KEY, '>',
      ) as any;

      if (!entries || entries.length === 0 || !entries[0]?.[1]?.length) {
        return;
      }

      const messages = entries[0][1];
      const parsed = messages.map(([id, fields]: [string, string[]]) => {
        const obj: Record<string, string> = {};
        for (let i = 0; i < fields.length; i += 2) {
          obj[fields[i]] = fields[i + 1];
        }
        return { id, ...obj };
      });

      // Batch insert into Postgres
      await batchInsertEvents(parsed);

      // Acknowledge processed messages
      const ids = messages.map(([id]: [string]) => id);
      if (ids.length > 0) {
        await redis.xack(STREAM_KEY, CONSUMER_GROUP, ...ids);
        // Trim processed entries
        await redis.xdel(STREAM_KEY, ...ids);
      }

      dbCircuitBreaker.recordSuccess();

      // Update metrics
      await redis.incrby('metrics:events_processed', ids.length);
    } catch (err) {
      dbCircuitBreaker.recordFailure();
      console.error('[EventPipeline] Drain error:', err);
    }
  };

  // Run drain loop
  setInterval(drain, DRAIN_INTERVAL_MS);

  // Also start pending message recovery
  setInterval(() => recoverPendingMessages(consumerName), 60_000);
}

// ─── Batch Database Insert ──────────────────────────────────

async function batchInsertEvents(
  events: Array<Record<string, string>>,
): Promise<void> {
  if (events.length === 0) return;

  // Group by session for efficient DB writes
  const bySession = new Map<string, typeof events>();
  for (const event of events) {
    const sessionId = event.sessionId;
    if (!bySession.has(sessionId)) bySession.set(sessionId, []);
    bySession.get(sessionId)!.push(event);
  }

  // Bulk insert per session
  const inserts = [];
  for (const [sessionId, sessionEvents] of bySession) {
    inserts.push(
      prisma.eventLog.createMany({
        data: sessionEvents.map(e => ({
          sessionId,
          eventType: e.eventType,
          payload: JSON.parse(e.payload || '{}'),
          timestamp: new Date(parseInt(e.timestamp, 10)),
          sequence: parseInt(e.sequence, 10),
        })),
        skipDuplicates: true,
      }),
    );
  }

  // Execute in parallel with concurrency limit
  const CONCURRENCY = 5;
  for (let i = 0; i < inserts.length; i += CONCURRENCY) {
    await Promise.all(inserts.slice(i, i + CONCURRENCY));
  }
}

// ─── Pending Message Recovery ───────────────────────────────

/**
 * Recover messages that were read but not acknowledged (crashed workers).
 * Moves permanently stuck messages to the dead letter queue.
 */
async function recoverPendingMessages(consumerName: string): Promise<void> {
  try {
    // Check for pending messages older than 60 seconds
    const pending = await redis.xpending(
      STREAM_KEY, CONSUMER_GROUP,
      '-', '+', 100,
    ) as any;

    if (!pending || pending.length === 0) return;

    for (const [id, consumer, idleMs, deliveryCount] of pending) {
      const idle = parseInt(idleMs, 10);
      const deliveries = parseInt(deliveryCount, 10);

      if (deliveries > MAX_RETRIES) {
        // Move to dead letter queue
        const message = await redis.xrange(STREAM_KEY, id, id);
        if (message.length > 0) {
          await redis.lpush(DLQ_KEY, JSON.stringify({
            originalId: id,
            fields: message[0],
            failedAt: Date.now(),
            deliveryCount: deliveries,
          }));
          await redis.xack(STREAM_KEY, CONSUMER_GROUP, id);
          console.warn(`[EventPipeline] Moved message ${id} to DLQ after ${deliveries} attempts`);
        }
      } else if (idle > 60_000) {
        // Claim and reprocess
        await redis.xclaim(
          STREAM_KEY, CONSUMER_GROUP, consumerName,
          60_000, id,
        );
      }
    }
  } catch (err) {
    console.error('[EventPipeline] Pending recovery error:', err);
  }
}

// ─── Monitoring ─────────────────────────────────────────────

export async function getIngestionMetrics(): Promise<{
  streamLength: number;
  eventsIngested: number;
  eventsProcessed: number;
  dlqSize: number;
  circuitBreakerState: string;
  utilizationPercent: number;
}> {
  const [streamLength, ingested, processed, dlqSize] = await Promise.all([
    redis.xlen(STREAM_KEY),
    redis.get('metrics:events_ingested'),
    redis.get('metrics:events_processed'),
    redis.llen(DLQ_KEY),
  ]);

  return {
    streamLength,
    eventsIngested: parseInt(ingested || '0', 10),
    eventsProcessed: parseInt(processed || '0', 10),
    dlqSize,
    circuitBreakerState: dbCircuitBreaker.getState(),
    utilizationPercent: Math.round((streamLength / MAX_STREAM_LENGTH) * 100),
  };
}
