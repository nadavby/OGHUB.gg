'use client';

import { useCallback } from 'react';
import { api, getStoredToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export interface ChallengeListItem {
  id: string;
  gameId: string;
  gameTitle: string;
  gameSlug: string;
  title: string;
  description: string | null;
  entryFee: string;
  prizePool: string;
  maxEntries: number | null;
  entries: number;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  createdAt: string;
}

export interface ChallengeDetail extends ChallengeListItem {
  leaderboard: { userId: string; username: string; score: number; rank: number }[];
  userEntry: { sessionId: string; status: string } | null;
}

export interface ChallengeListResult {
  challenges: ChallengeListItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ListChallengesParams {
  status?: string;
  gameId?: string;
  page?: number;
  limit?: number;
}

export function useChallenges() {
  const listChallenges = useCallback(async (params: ListChallengesParams = {}): Promise<ChallengeListResult> => {
    const token = getStoredToken();
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.gameId) query.set('gameId', params.gameId);
    if (params.page != null) query.set('page', String(params.page));
    if (params.limit != null) query.set('limit', String(params.limit));

    const url = `${API_URL}/api/challenges${query.toString() ? `?${query.toString()}` : ''}`;
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
      challenges: json.data as ChallengeListItem[],
      total: json.total,
      page: json.page,
      limit: json.limit,
      hasMore: json.hasMore,
    };
  }, []);

  const getChallenge = useCallback(async (id: string): Promise<ChallengeDetail> => {
    const token = getStoredToken();
    return api<ChallengeDetail>(`/api/challenges/${id}`, { token: token ?? undefined });
  }, []);

  return { listChallenges, getChallenge };
}
