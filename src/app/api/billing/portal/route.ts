// src/app/api/billing/portal/route.ts
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
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    // 1. Verify project membership
    const userId = (session.user as any).id;
    const member = await db.query(`
      SELECT role FROM project_members 
      WHERE project_id = $1 AND user_id = $2
    `, [projectId, userId]).then(res => res[0]);

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2. Simulated billing fallback
    if (!isStripeConfigured) {
      console.log(`[Billing] Stripe not configured. Executing simulated downgrade/portal action for project ${projectId}`);
      
      // Downgrade back to Free tier
      await db.query(`
        UPDATE projects 
        SET subscription_tier = 'free', 
            monthly_events_limit = 50000, 
            subscription_status = 'active',
            stripe_subscription_id = NULL
        WHERE id = $1
      `, [projectId]);

      return NextResponse.json({ 
        success: true, 
        url: `/dashboard/${projectId}/settings?billing=downgraded`, 
        simulated: true 
      });
    }

    // 3. Stripe Integration Mode
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe is disabled' }, { status: 500 });
    }

    const project = await db.query(`
      SELECT stripe_customer_id FROM projects WHERE id = $1
    `, [projectId]).then(res => res[0]);

    const customerId = project?.stripe_customer_id;
    if (!customerId) {
      return NextResponse.json({ error: 'No billing profile found. Please subscribe first.' }, { status: 400 });
    }

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    // Create billing portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/dashboard/${projectId}/settings`
    });

    return NextResponse.json({ success: true, url: portalSession.url });

  } catch (err: any) {
    console.error('Portal error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
