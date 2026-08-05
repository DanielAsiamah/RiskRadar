import Stripe from 'stripe';
import { createCheckoutReference, verifyCheckoutReference } from './checkout-reference.mjs';
import { normalizeStripeSubscription, shouldApplyStripeEvent } from './subscription-state.mjs';

function toEventCreatedAt(created) {
  return new Date(created * 1000).toISOString();
}

function hasPremiumPrice(lineItems, premiumPriceId) {
  return Array.isArray(lineItems?.data) &&
    lineItems.data.some((item) => item?.price?.id === premiumPriceId);
}

function assertSafeReturnUrl(returnUrl, webAppUrl) {
  const target = new URL(returnUrl);
  const allowed = new URL(webAppUrl);

  if (target.origin !== allowed.origin) {
    throw new Error('Return URL must stay on the RiskRadar web app.');
  }
}

async function resolveStoredSubscription(store, { customerId, subscriptionId }) {
  if (subscriptionId) {
    const bySubscription = await store.getSubscriptionByStripeSubscription(subscriptionId);
    if (bySubscription) {
      return bySubscription;
    }
  }

  if (customerId) {
    const byCustomer = await store.getSubscriptionByStripeCustomer(customerId);
    if (byCustomer) {
      return byCustomer;
    }
  }

  return null;
}

export function createStripeBilling({ config, store, stripe = new Stripe(config.stripeSecretKey) }) {
  return {
    buildCheckoutUrl(user) {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const checkoutUrl = new URL(config.stripePaymentLinkUrl);
      const reference = createCheckoutReference({
        userId: user.userId,
        expiresAt,
      }, config.billingReferenceSecret);

      checkoutUrl.searchParams.set('client_reference_id', reference);
      if (user.email) {
        checkoutUrl.searchParams.set('prefilled_email', user.email);
      }

      return checkoutUrl.toString();
    },

    async createPortalUrl(user, returnUrl) {
      assertSafeReturnUrl(returnUrl, config.webAppUrl);

      const subscription = await store.getSubscription(user.userId);
      if (!subscription?.stripe_customer_id) {
        throw new Error('A stored Stripe customer is required.');
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: subscription.stripe_customer_id,
        return_url: returnUrl,
      });

      return session.url;
    },

    async processWebhook(rawBody, signature) {
      let event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
      } catch {
        throw new Error('Invalid signature for Stripe webhook.');
      }

      const claimed = await store.claimBillingEvent({
        stripe_event_id: event.id,
        event_type: event.type,
      });
      if (!claimed) {
        return {
          accepted: true,
          duplicate: true,
        };
      }

      const eventCreatedAt = toEventCreatedAt(event.created);

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const verified = verifyCheckoutReference(
          session.client_reference_id,
          config.billingReferenceSecret,
        );
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
        if (!hasPremiumPrice(lineItems, config.stripePremiumPriceId)) {
          throw new Error('Checkout session did not include the premium price.');
        }

        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const row = normalizeStripeSubscription(subscription, verified.userId, eventCreatedAt);

        await store.upsertSubscription(row);
        return {
          accepted: true,
          duplicate: false,
        };
      }

      if (
        event.type === 'invoice.paid' ||
        event.type === 'invoice.payment_failed' ||
        event.type === 'customer.subscription.updated' ||
        event.type === 'customer.subscription.deleted' ||
        event.type === 'customer.subscription.created'
      ) {
        const object = event.data.object;
        const customerId = object.customer ?? null;
        const subscriptionId = object.subscription ?? object.id ?? null;
        const stored = await resolveStoredSubscription(store, { customerId, subscriptionId });

        if (!stored?.user_id) {
          throw new Error('Unable to resolve the RiskRadar member for this Stripe event.');
        }

        if (!shouldApplyStripeEvent(stored.last_event_created_at, eventCreatedAt)) {
          return {
            accepted: true,
            duplicate: false,
          };
        }

        const stripeSubscription = event.type.startsWith('customer.subscription.')
          ? object
          : await stripe.subscriptions.retrieve(subscriptionId);
        const row = normalizeStripeSubscription(stripeSubscription, stored.user_id, eventCreatedAt);

        await store.upsertSubscription(row);
        return {
          accepted: true,
          duplicate: false,
        };
      }

      return {
        accepted: true,
        duplicate: false,
      };
    },
  };
}
