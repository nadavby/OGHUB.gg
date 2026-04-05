/**
 * @oghub/sdk — Web SDK for OGHub platform
 *
 * Thin wrapper around @oghub/sdk-core. Re-exports the core SDK
 * which uses browser-native fetch and WebSocket.
 *
 * Usage:
 *   import { OGHub } from '@oghub/sdk';
 *   const og = new OGHub({ apiKey, apiSecret, gameSlug, apiUrl });
 *   const session = await og.createSession({ challengeId });
 *   og.startSession();
 *   og.reportInput({ name: 'shoot', data: { weapon: 'laser' } });
 *   og.updateScore(1500);
 *   const result = await og.endSession();
 */

import { OGHubSDK } from '@oghub/sdk-core';
import type { SDKInitConfig } from '@oghub/sdk-core';

export class OGHub extends OGHubSDK {
  constructor(config: Omit<SDKInitConfig, 'apiUrl'> & { apiUrl?: string }) {
    super();
    this.init({
      apiUrl: config.apiUrl ?? 'https://api.oghub.gg',
      ...config,
    });
  }
}

// Re-export all types
export {
  OGHubSDK,
  type SDKInitConfig,
  type CreateSessionOptions,
  type Session,
  type SessionResult,
  type GameInput,
  type GameEvent,
  type GhostReplay,
  type NearMissInfo,
  type StateSnapshot,
  type ValidationRequestHandler,
  type SessionKillHandler,
  type LeaderboardUpdateHandler,
} from '@oghub/sdk-core';
