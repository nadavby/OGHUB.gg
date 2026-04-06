import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import { prisma, redis } from '../main';
import { getRoomState, roomEventsChannel } from './room-redis';

interface RoomClient {
  ws: WebSocket;
  userId: string;
  roomId: string;
  alive: boolean;
}

const clients = new Map<WebSocket, RoomClient>();
const roomSubscriptions = new Map<string, Set<WebSocket>>();

// Dedicated Redis connection for subscriptions (subscriber can't do other commands)
let subscriberRedis: Redis | null = null;

export function attachRoomWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/api/rooms/live' });

  // Create dedicated subscriber connection
  subscriberRedis = new Redis(process.env.REDIS_URL!);

  subscriberRedis.on('message', (channel: string, message: string) => {
    // channel = "room:{roomId}:events"
    const parts = channel.split(':');
    if (parts.length < 3) return;
    const roomId = parts[1];

    const sockets = roomSubscriptions.get(roomId);
    if (!sockets) return;

    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  });

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const roomId = url.searchParams.get('roomId');
    const token = url.searchParams.get('token');

    if (!roomId || !token) {
      ws.close(4001, 'Missing roomId or token');
      return;
    }

    // Verify JWT
    let userId: string;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      userId = decoded.userId;
    } catch {
      ws.close(4003, 'Invalid token');
      return;
    }

    // Verify user is a participant
    const participant = await prisma.roomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!participant) {
      ws.close(4004, 'Not a participant');
      return;
    }

    // Register client
    const client: RoomClient = { ws, userId, roomId, alive: true };
    clients.set(ws, client);

    // Subscribe to room channel if first client for this room
    if (!roomSubscriptions.has(roomId)) {
      roomSubscriptions.set(roomId, new Set());
      await subscriberRedis!.subscribe(roomEventsChannel(roomId));
    }
    roomSubscriptions.get(roomId)!.add(ws);

    // Send current state sync
    await sendStateSync(ws, roomId);

    // Heartbeat
    ws.on('pong', () => { client.alive = true; });

    ws.on('close', () => {
      cleanup(ws);
    });

    ws.on('error', () => {
      cleanup(ws);
    });
  });

  // Heartbeat interval — every 15 seconds
  setInterval(() => {
    for (const [ws, client] of clients) {
      if (!client.alive) {
        ws.terminate();
        cleanup(ws);
        continue;
      }
      client.alive = false;
      ws.ping();
    }
  }, 15_000);
}

async function sendStateSync(ws: WebSocket, roomId: string): Promise<void> {
  // Try Redis first, fall back to DB
  let state = await getRoomState(roomId);

  if (!state || !state.status) {
    // Fallback to DB
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          include: { user: { select: { username: true, displayName: true } } },
        },
      },
    });
    if (!room) return;

    state = {
      status: room.status,
      players: JSON.stringify(room.participants.map(p => ({
        userId: p.userId,
        displayName: p.user.displayName || p.user.username,
        isReady: p.isReady,
      }))),
      maxPlayers: String(room.maxPlayers),
    };
  }

  ws.send(JSON.stringify({
    type: 'state_sync',
    room: {
      status: state.status,
      players: JSON.parse(state.players || '[]'),
      readyPlayers: JSON.parse(state.readyPlayers || '[]'),
      maxPlayers: parseInt(state.maxPlayers || '2'),
      launchAt: state.launchAt ? parseInt(state.launchAt) : undefined,
    },
  }));
}

function cleanup(ws: WebSocket): void {
  const client = clients.get(ws);
  if (!client) return;

  clients.delete(ws);

  const roomSockets = roomSubscriptions.get(client.roomId);
  if (roomSockets) {
    roomSockets.delete(ws);
    if (roomSockets.size === 0) {
      roomSubscriptions.delete(client.roomId);
      subscriberRedis?.unsubscribe(roomEventsChannel(client.roomId)).catch(() => {});
    }
  }
}
