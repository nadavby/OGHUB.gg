import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import crypto from 'crypto';
import { prisma, redis } from '../main';
import type { GameDefinition } from '@oghub/shared';

interface LiveSession {
  ws: WebSocket;
  sessionId: string;
  userId: string;
  definition: GameDefinition;
  scoreHashChain: string[];
  lastScore: number;
  anomalyCount: number;
  validationInterval: ReturnType<typeof setInterval> | null;
  pendingValidation: string | null;
  pendingTimeout: ReturnType<typeof setTimeout> | null;
}

const sessions = new Map<string, LiveSession>();

export function attachLiveValidator(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/api/sessions/live' });

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');
    const token = url.searchParams.get('token');

    if (!sessionId || !token) {
      ws.close(4001, 'Missing sessionId or token');
      return;
    }

    // Validate session
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { game: { include: { definition: true } } },
    });

    if (!session || session.token !== token) {
      ws.close(4003, 'Invalid session');
      return;
    }

    if (!session.game.definition) {
      ws.close(4004, 'Game has no definition');
      return;
    }

    const definition = session.game.definition.definition as unknown as GameDefinition;

    // Only standard+ tiers use live validation
    if (definition.trust.tier === 'basic') {
      ws.close(4005, 'Basic tier does not support live validation');
      return;
    }

    const liveSession: LiveSession = {
      ws,
      sessionId,
      userId: session.userId,
      definition,
      scoreHashChain: [],
      lastScore: 0,
      anomalyCount: 0,
      validationInterval: null,
      pendingValidation: null,
      pendingTimeout: null,
    };

    sessions.set(sessionId, liveSession);

    // Start periodic validation requests
    const intervalMs = (definition.validation?.snapshotInterval ?? 5) * 1000;
    liveSession.validationInterval = setInterval(() => {
      sendValidationRequest(liveSession);
    }, intervalMs);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(liveSession, msg);
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      cleanup(sessionId);
    });

    ws.on('error', () => {
      cleanup(sessionId);
    });

    // Send connected acknowledgment
    ws.send(JSON.stringify({ type: 'connected', sessionId }));
  });
}

function sendValidationRequest(session: LiveSession): void {
  if (session.ws.readyState !== WebSocket.OPEN) return;
  if (session.pendingValidation) {
    session.anomalyCount++;
    if (session.anomalyCount >= 3) {
      flagSession(session.sessionId, 'validation_timeout');
    }
  }

  const requestId = `vr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  session.pendingValidation = requestId;
  session.ws.send(JSON.stringify({
    type: 'validation_request',
    requestId,
    timestamp: Date.now(),
  }));

  // Timeout: 5 seconds to respond
  session.pendingTimeout = setTimeout(() => {
    if (session.pendingValidation === requestId) {
      session.anomalyCount++;
      session.pendingValidation = null;
      if (session.anomalyCount >= 3) {
        flagSession(session.sessionId, 'validation_timeout');
      }
    }
  }, 5000);
}

function handleMessage(session: LiveSession, msg: any): void {
  switch (msg.type) {
    case 'validation_response':
      handleValidationResponse(session, msg);
      break;
    case 'score_update':
      handleScoreUpdate(session, msg);
      break;
  }
}

function handleValidationResponse(session: LiveSession, msg: any): void {
  if (msg.requestId !== session.pendingValidation) return;

  session.pendingValidation = null;
  if (session.pendingTimeout) {
    clearTimeout(session.pendingTimeout);
    session.pendingTimeout = null;
  }

  const state = msg.state;
  if (!state) {
    session.anomalyCount++;
    return;
  }

  // Validate required fields are present
  const required = session.definition.validation?.requiredFields ?? [];
  const missing = required.filter(f => !(f in state));
  if (missing.length > 0) {
    session.anomalyCount++;
    if (session.anomalyCount >= 2) {
      flagSession(session.sessionId, `missing_fields:${missing.join(',')}`);
    }
    return;
  }

  // Cross-check score consistency
  const reportedScore = typeof state.current_score === 'number' ? state.current_score : null;
  if (reportedScore !== null && session.lastScore > 0) {
    if (session.definition.scoring.method === 'accumulative' && reportedScore < session.lastScore * 0.9) {
      session.anomalyCount++;
      flagSession(session.sessionId, `score_decreased:${reportedScore}<${session.lastScore}`);
    }
  }
}

function handleScoreUpdate(session: LiveSession, msg: any): void {
  const { score, hash, sequence } = msg;
  if (typeof score !== 'number' || typeof hash !== 'string') return;

  // Verify hash chain
  const previousHash = session.scoreHashChain.length > 0
    ? session.scoreHashChain[session.scoreHashChain.length - 1]
    : session.sessionId;
  const expectedPayload = `${previousHash}:${score}:${sequence}`;
  const expectedHash = crypto
    .createHash('sha256')
    .update(expectedPayload)
    .digest('hex');

  if (hash !== expectedHash) {
    session.anomalyCount += 2;
    flagSession(session.sessionId, 'hash_chain_broken');
  }

  session.scoreHashChain.push(hash);
  session.lastScore = score;
}

async function flagSession(sessionId: string, reason: string): Promise<void> {
  await redis.set(
    `live_flag:${sessionId}`,
    JSON.stringify({ reason, timestamp: Date.now() }),
    'EX', 86400,
  );

  const session = sessions.get(sessionId);
  if (session && session.validationInterval) {
    clearInterval(session.validationInterval);
    const newInterval = ((session.definition.validation?.snapshotInterval ?? 5) * 1000) / 2;
    session.validationInterval = setInterval(() => {
      sendValidationRequest(session);
    }, newInterval);
  }
}

function cleanup(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    if (session.validationInterval) clearInterval(session.validationInterval);
    if (session.pendingTimeout) clearTimeout(session.pendingTimeout);
    sessions.delete(sessionId);
  }
}

export async function getLiveValidationFlags(sessionId: string): Promise<string | null> {
  return redis.get(`live_flag:${sessionId}`);
}
