export interface CheckoutResult {
  sessionId: string;
  redirectUrl: string;
}

export interface WebhookResult {
  sessionId: string;
  status: 'completed' | 'failed' | 'expired';
  providerPaymentId: string;
  amount: number;
}

export interface PayoutResult {
  providerPayoutId: string;
  status: 'pending' | 'completed' | 'failed';
}

export type RecipientDetails =
  | { type: 'card_refund' }
  | { type: 'bank'; holderName: string; routingNumber: string; accountNumber: string }
  | { type: 'crypto'; address: string; network: 'ERC20' | 'TRC20' | 'SOL' | 'BTC' };

export interface PaymentProvider {
  readonly name: string;
  createCheckout(userId: string, amount: number, currency: string, metadata?: Record<string, string>): Promise<CheckoutResult>;
  verifyWebhook(headers: Record<string, string>, body: Buffer | string): Promise<WebhookResult>;
  createPayout(amount: number, recipient: RecipientDetails): Promise<PayoutResult>;
}
