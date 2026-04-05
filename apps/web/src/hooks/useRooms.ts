'use client';

import { useCallback } from 'react';
import { api, getStoredToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export interface RoomListItem {
  id: string;
  gameId: string;
  gameTitle: string;
  gameSlug: string;
  creator: string;
  format: string;
  entryFee: string;
  prizePool: string;
  maxPlayers: number;
  currentPlayers: number;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export interface RoomDetail {
  id: string;
  gameId: string;
  gameTitle: string;
  gameSlug: string;
  creator: string;
  createdByUserId: string;
  format: string;
  entryFee: string;
  prizePool: string;
  maxPlayers: number;
  currentPlayers: number;
  currentRound: number;
  totalRounds: number;
  status: string;
  expiresAt: string;
  participants: { userId: string; username: string; joinedAt: string }[];
  createdAt: string;
}

export interface RoomListResult {
  rooms: RoomListItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ListRoomsParams {
  gameId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface CreateRoomParams {
  gameId: string;
  format: string;
  entryFee: string;
}

export interface CreateRoomResult {
  id: string;
  gameId: string;
  format: string;
  entryFee: string;
  prizePool: string;
  maxPlayers: number;
  currentPlayers: number;
  status: string;
  expiresAt: string;
}

export interface JoinRoomResult {
  joined: boolean;
  roomId: string;
  currentPlayers: number;
  isFull: boolean;
  status: string;
}

export interface CancelRoomResult {
  cancelled: true;
}

export function useRooms() {
  const listRooms = useCallback(async (params: ListRoomsParams = {}): Promise<RoomListResult> => {
    const token = getStoredToken();
    const query = new URLSearchParams();
    if (params.gameId) query.set('gameId', params.gameId);
    if (params.status) query.set('status', params.status);
    if (params.page != null) query.set('page', String(params.page));
    if (params.limit != null) query.set('limit', String(params.limit));

    const url = `${API_URL}/api/rooms${query.toString() ? `?${query.toString()}` : ''}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, { method: 'GET', headers });
    const json = await res.json();

    if (!res.ok || !json.success) {
      throw new Error(json.error || `Request failed: ${res.status}`);
    }

    return {
      rooms: json.data as RoomListItem[],
      total: json.total,
      page: json.page,
      limit: json.limit,
      hasMore: json.hasMore,
    };
  }, []);

  const getRoom = useCallback(async (id: string): Promise<RoomDetail> => {
    const token = getStoredToken();
    return api<RoomDetail>(`/api/rooms/${id}`, { token: token ?? undefined });
  }, []);

  const createRoom = useCallback(async (params: CreateRoomParams): Promise<CreateRoomResult> => {
    const token = getStoredToken();
    return api<CreateRoomResult>('/api/rooms/create', {
      method: 'POST',
      body: params,
      token: token ?? undefined,
    });
  }, []);

  const joinRoom = useCallback(async (id: string): Promise<JoinRoomResult> => {
    const token = getStoredToken();
    return api<JoinRoomResult>(`/api/rooms/${id}/join`, {
      method: 'POST',
      token: token ?? undefined,
    });
  }, []);

  const cancelRoom = useCallback(async (id: string): Promise<CancelRoomResult> => {
    const token = getStoredToken();
    return api<CancelRoomResult>(`/api/rooms/${id}/cancel`, {
      method: 'POST',
      token: token ?? undefined,
    });
  }, []);

  return { listRooms, getRoom, createRoom, joinRoom, cancelRoom };
}
