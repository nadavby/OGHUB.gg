import crypto from 'crypto';

export interface CoinFlipResult {
  won: boolean;
  serverSeed: string;
  clientSeed: string;
  hash: string;
}

export function flipCoin(): CoinFlipResult {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  const clientSeed = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(serverSeed + clientSeed).digest('hex');
  const lastByte = parseInt(hash.slice(-2), 16);
  const won = lastByte % 2 === 0;
  return { won, serverSeed, clientSeed, hash };
}
