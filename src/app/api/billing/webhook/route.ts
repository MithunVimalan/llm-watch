// src/app/api/billing/webhook/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { stripe } from '@/lib/stripe';

function getTierDetails(priceId: string) {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) {
    return { tier: 'pro', limit: 1000000 };
  }
  if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) {
    return { tier: 'enterprise', limit: 10000000 };
  }
  return { tier: 'free', limit: 50000 };
}

export async function POST(req: Request) {
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe webhooks not configured' }, { status: 400 });
  }

  const payload = await req.text();
  const signature = req.headers.get('stripe-signature') || '';
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err: any) {
    console.error(`[Webhook] Signature verification failed: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  console.log(`[Webhook] Received event type: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const projectId = session.metadata?.projectId;
        const tier = session.metadata?.tier;

        if (!projectId || !tier) {
          console.warn('[Webhook] Missing metadata in checkout session', session.id);
          break;
        }

        const limit = tier === 'pro' ? 1000000 : 10000000;
        const subId = session.subscription || null;

        await db.query(`
          UPDATE projects 
          SET subscription_tier = $1,
              monthly_events_limit = $2,
              subscription_status = 'active',
              stripe_subscription_id = $3
          WHERE id = $4
        `, [tier, limit, subId, projectId]);
        
        console.log(`[Webhook] Upgraded project ${projectId} to tier: ${tier}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;
        const customerId = subscription.customer;
        const subId = subscription.id;
        const priceId = subscription.items.data[0]?.price?.id;
        const status = subscription.status; // e.g. active, past_due, canceled, unpaid

        // Find tier details from price ID
        const { tier, limit } = getTierDetails(priceId);

        if (['canceled', 'unpaid'].includes(status)) {
          // Downgrade to free tier
          await db.query(`
            UPDATE projects 
            SET subscription_tier = 'free',
                monthly_events_limit = 50000,
                subscription_status = $1,
                stripe_subscription_id = NULL
            WHERE stripe_customer_id = $2 OR stripe_subscription_id = $3
          `, [status, customerId, subId]);
          console.log(`[Webhook] Downgraded project matching sub ${subId} to free due to status: ${status}`);
        } else {
          // Sync plan and status
          await db.query(`
            UPDATE projects 
            SET subscription_tier = $1,
                monthly_events_limit = $2,
                subscription_status = $3,
                stripe_subscription_id = $4
            WHERE stripe_customer_id = $5 OR stripe_subscription_id = $4
          `, [tier, limit, status, subId, customerId]);
          console.log(`[Webhook] Synced subscription ${subId} state to status: ${status}, tier: ${tier}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        const subId = subscription.id;

        // Revert back to free tier
        await db.query(`
          UPDATE projects 
          SET subscription_tier = 'free',
              monthly_events_limit = 50000,
              subscription_status = 'canceled',
              stripe_subscription_id = NULL
          WHERE stripe_subscription_id = $1
        `, [subId]);

        console.log(`[Webhook] Canceled subscription ${subId} and reset to free tier.`);
        break;
      }

      default:
        console.log(`[Webhook] Ignored unhandled event: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('[Webhook] Failed to process database sync:', err);
    return NextResponse.json({ error: 'DB Sync failed' }, { status: 500 });
  }
}
