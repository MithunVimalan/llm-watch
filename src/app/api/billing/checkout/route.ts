// src/app/api/billing/checkout/route.ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { stripe, isStripeConfigured } from '@/lib/stripe';

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { projectId, tier } = body;

    if (!projectId || !['pro', 'enterprise'].includes(tier)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    // 1. Verify project access & membership role (must be owner or admin to upgrade)
    const userId = (session.user as any).id;
    const member = await db.query(`
      SELECT role FROM project_members 
      WHERE project_id = $1 AND user_id = $2
    `, [projectId, userId]).then(res => res[0]);

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Forbidden: Requires admin/owner access' }, { status: 403 });
    }

    // 2. Resolve Price Limit
    const limit = tier === 'pro' ? 1000000 : 10000000;

    // 3. Check if Stripe is configured. If not, default to Simulated Billing Flow
    if (!isStripeConfigured) {
      console.log(`[Billing] Stripe not configured. Executing simulated upgrade for project ${projectId} to tier: ${tier}`);
      
      await db.query(`
        UPDATE projects 
        SET subscription_tier = $1, 
            monthly_events_limit = $2, 
            subscription_status = 'active',
            stripe_subscription_id = 'sub_simulated_' || gen_random_uuid()::text
        WHERE id = $3
      `, [tier, limit, projectId]);

      return NextResponse.json({ success: true, url: `/dashboard/${projectId}/settings?billing=success`, simulated: true });
    }

    // 4. Stripe Integration Mode
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe is disabled' }, { status: 500 });
    }

    // Fetch existing Stripe Customer ID
    const project = await db.query(`
      SELECT stripe_customer_id FROM projects WHERE id = $1
    `, [projectId]).then(res => res[0]);

    let customerId = project?.stripe_customer_id;

    if (!customerId) {
      // Create a customer in Stripe
      const customer = await stripe.customers.create({
        email: session.user.email || 'customer@llmwatch.com',
        metadata: { projectId }
      });
      customerId = customer.id;
      
      await db.query(`
        UPDATE projects SET stripe_customer_id = $1 WHERE id = $2
      `, [customerId, projectId]);
    }

    // Resolve price ID
    const priceId = tier === 'pro' 
      ? process.env.STRIPE_PRO_PRICE_ID 
      : process.env.STRIPE_ENTERPRISE_PRICE_ID;

    if (!priceId) {
      return NextResponse.json({ error: 'Stripe Price ID is not configured on server env' }, { status: 500 });
    }

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    // Create checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${baseUrl}/dashboard/${projectId}/settings?billing=success`,
      cancel_url: `${baseUrl}/dashboard/${projectId}/settings?billing=cancel`,
      metadata: { projectId, tier }
    });

    return NextResponse.json({ success: true, url: checkoutSession.url });

  } catch (err: any) {
    console.error('Checkout error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
