'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getStoredToken } from '@/lib/api';

const WS_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/^http/, 'ws');

export interface RoomPlayer {
  userId: string;
  displayName: string;
  isReady?: boolean;
}

export interface RoomState {
  status: string;
  players: RoomPlayer[];
  readyPlayers: string[];
  maxPlayers: number;
  launchAt?: number;
}

export interface RoomEvent {
  type: string;
  [key: string]: any;
}

interface UseRoomSocketOptions {
  roomId: string;
  onEvent?: (event: RoomEvent) => void;
}

export function useRoomSocket({ roomId, onEvent }: UseRoomSocketOptions) {
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    const token = getStoredToken();
    if (!token || !roomId) return;

    const ws = new WebSocket(`${WS_URL}/api/rooms/live?roomId=${roomId}&token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'state_sync') {
          setRoomState(data.room);
          return;
        }

        // Update local state based on events
        setRoomState(prev => {
          if (!prev) return prev;
          return applyEvent(prev, data);
        });

        onEventRef.current?.(data);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Reconnect after 2 seconds
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [roomId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { roomState, connected };
}

function applyEvent(state: RoomState, event: RoomEvent): RoomState {
  switch (event.type) {
    case 'player_joined':
      return {
        ...state,
        players: [...state.players, {
          userId: event.userId,
          displayName: event.displayName,
        }],
      };

    case 'player_ready':
      return {
        ...state,
        readyPlayers: [...state.readyPlayers, event.userId],
        players: state.players.map(p =>
          p.userId === event.userId ? { ...p, isReady: true } : p
        ),
      };

    case 'ready_check_started':
      return {
        ...state,
        status: 'READY_CHECK',
        readyPlayers: [],
      };

    case 'countdown_started':
      return {
        ...state,
        status: 'COUNTDOWN',
        launchAt: event.launchAt,
      };

    case 'game_launching':
      return { ...state, status: 'IN_PROGRESS' };

    case 'player_finished':
      return state; // UI handles separately

    case 'settling':
      return { ...state, status: 'SETTLING' };

    case 'room_completed':
    case 'room_cancelled':
    case 'ready_check_failed':
      return { ...state, status: event.type === 'room_completed' ? 'COMPLETED' : 'CANCELLED' };

    default:
      return state;
  }
}
