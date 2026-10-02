import Stripe from 'stripe';
import { PaymentProvider, CheckoutResult, WebhookResult, PayoutResult, RecipientDetails } from './provider.interface';

// stripe v22's CJS typings expose the constructor as a plain function type
type StripeClient = Stripe.Stripe;
type CheckoutSession = Awaited<ReturnType<StripeClient['checkout']['sessions']['retrieve']>>;
const StripeCtor = Stripe as unknown as new (key: string, config?: Record<string, unknown>) => StripeClient;

const stripe = new StripeCtor(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

export class StripeProvider implements PaymentProvider {
  readonly name = 'STRIPE';

  async createCheckout(userId: string, amount: number, currency: string, metadata?: Record<string, string>): Promise<CheckoutResult> {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: Math.round(amount * 100),
          product_data: { name: 'OGHUB Wallet Deposit' },
        },
        quantity: 1,
      }],
      metadata: {
        userId,
        type: 'deposit',
        ...metadata,
      },
      expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/wallet?checkout=success&session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/wallet?checkout=cancelled`,
    });

    return {
      sessionId: session.id,
      redirectUrl: session.url!,
    };
  }

  async verifyWebhook(headers: Record<string, string>, body: Buffer | string): Promise<WebhookResult> {
    const sig = headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);

    if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.expired') {
      throw new Error(`Unhandled event type: ${event.type}`);
    }

    const session = event.data.object as CheckoutSession;

    let status: 'completed' | 'failed' | 'expired';
    if (event.type === 'checkout.session.completed' && session.payment_status === 'paid') {
      status = 'completed';
    } else if (event.type === 'checkout.session.expired') {
      status = 'expired';
    } else {
      status = 'failed';
    }

    return {
      sessionId: session.id,
      status,
      providerPaymentId: (session.payment_intent as string) || session.id,
      amount: (session.amount_total || 0) / 100,
    };
  }

  async createPayout(amount: number, recipient: RecipientDetails): Promise<PayoutResult> {
    // Phase 1: Mark as pending for manual processing
    // Bank/card payouts require Stripe Connect (future phase)
    return {
      providerPayoutId: `manual_stripe_${Date.now()}`,
      status: 'pending',
    };
  }
}

export const stripeProvider = new StripeProvider();
