import crypto from 'crypto';
import { PaymentProvider, CheckoutResult, WebhookResult, PayoutResult, RecipientDetails } from './provider.interface';

const API_BASE = 'https://api.nowpayments.io/v1';
const API_KEY = process.env.NOWPAYMENTS_API_KEY!;
const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET!;

async function nowpayFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NOWPayments API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export class NowPayProvider implements PaymentProvider {
  readonly name = 'COINBASE'; // Maps to PaymentProviderType enum in Prisma

  async createCheckout(userId: string, amount: number, currency: string, metadata?: Record<string, string>): Promise<CheckoutResult> {
    const invoice = await nowpayFetch<{
      id: string;
      invoice_url: string;
    }>('/invoice', {
      method: 'POST',
      body: JSON.stringify({
        price_amount: amount,
        price_currency: currency.toLowerCase(),
        order_id: `dep_${userId}_${Date.now()}`,
        order_description: 'OGHUB Wallet Deposit',
        ipn_callback_url: `${process.env.API_URL || 'http://localhost:3001'}/api/payments/webhooks/nowpayments`,
        success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/wallet?checkout=success&session=np_${userId}_${Date.now()}`,
        cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/wallet?checkout=cancelled`,
        is_fee_paid_by_user: false,
      }),
    });

    return {
      sessionId: String(invoice.id),
      redirectUrl: invoice.invoice_url,
    };
  }

  async verifyWebhook(headers: Record<string, string>, body: Buffer | string): Promise<WebhookResult> {
    const bodyStr = typeof body === 'string' ? body : body.toString('utf-8');
    const receivedHmac = headers['x-nowpayments-sig'];

    if (!receivedHmac) {
      throw new Error('Missing NOWPayments signature header');
    }

    const parsed = JSON.parse(bodyStr);
    const sorted = JSON.stringify(
      Object.keys(parsed).sort().reduce((acc: Record<string, any>, key: string) => {
        acc[key] = parsed[key];
        return acc;
      }, {})
    );
    const expectedHmac = crypto.createHmac('sha512', IPN_SECRET).update(sorted).digest('hex');

    if (receivedHmac !== expectedHmac) {
      throw new Error('Invalid NOWPayments webhook signature');
    }

    let status: 'completed' | 'failed' | 'expired';
    if (parsed.payment_status === 'finished' || parsed.payment_status === 'confirmed') {
      status = 'completed';
    } else if (parsed.payment_status === 'expired') {
      status = 'expired';
    } else if (parsed.payment_status === 'failed' || parsed.payment_status === 'refunded') {
      status = 'failed';
    } else {
      throw new Error(`Non-terminal status: ${parsed.payment_status}`);
    }

    return {
      sessionId: String(parsed.invoice_id || parsed.order_id),
      status,
      providerPaymentId: String(parsed.payment_id),
      amount: parseFloat(parsed.price_amount),
    };
  }

  async createPayout(amount: number, recipient: RecipientDetails): Promise<PayoutResult> {
    if (recipient.type !== 'crypto') {
      throw new Error('NOWPayments only supports crypto payouts');
    }

    // Map network to NOWPayments currency code
    const NETWORK_TO_CURRENCY: Record<string, string> = {
      TRC20: 'usdttrc20',
      ERC20: 'usdterc20',
      SOL: 'usdtsol',
      BTC: 'btc',
    };
    const currency = NETWORK_TO_CURRENCY[recipient.network] || 'usdttrc20';

    const payout = await nowpayFetch<{
      id: string;
      status: string;
    }>('/payout', {
      method: 'POST',
      body: JSON.stringify({
        address: recipient.address,
        amount,
        currency,
        ipn_callback_url: `${process.env.API_URL || 'http://localhost:3001'}/api/payments/webhooks/nowpayments`,
      }),
    });

    return {
      providerPayoutId: String(payout.id),
      status: payout.status === 'FINISHED' ? 'completed' : 'pending',
    };
  }
}

export const nowpayProvider = new NowPayProvider();
