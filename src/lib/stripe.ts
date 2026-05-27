// src/lib/stripe.ts
import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2025-01-27' as any, // TypeScript safe override or standard API version
    })
  : null;

export const isStripeConfigured = !!stripeSecretKey;
