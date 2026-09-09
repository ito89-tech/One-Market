import "server-only";

import Stripe from "stripe";

import { serverEnv } from "./env";

let client: Stripe | null = null;

/** Null when no secret key is configured, so the app runs without Stripe. */
export function getStripe(): Stripe | null {
  const secretKey = serverEnv.stripe.secretKey();
  if (!secretKey) return null;
  if (!client) {
    client = new Stripe(secretKey, { typescript: true });
  }
  return client;
}

/** Stripe's subscription statuses mapped onto our enum. */
export function mapSubscriptionStatus(
  status: Stripe.Subscription.Status,
):
  | "ACTIVE"
  | "TRIALING"
  | "PAST_DUE"
  | "CANCELED"
  | "INCOMPLETE"
  | "INCOMPLETE_EXPIRED"
  | "UNPAID"
  | "PAUSED" {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "incomplete":
      return "INCOMPLETE";
    case "incomplete_expired":
      return "INCOMPLETE_EXPIRED";
    case "unpaid":
      return "UNPAID";
    case "paused":
      return "PAUSED";
    default:
      return "INCOMPLETE";
  }
}
