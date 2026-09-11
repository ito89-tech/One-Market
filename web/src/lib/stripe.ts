import "server-only";

import Stripe from "stripe";

import { serverEnv } from "./env";

let client: Stripe | null = null;

/**
 * API バージョンは固定する。未指定だとアカウント側の既定バージョンが使われ、
 * Stripe 側の更新で webhook のペイロード形が変わっても気付けない。ここは
 * インストール済み SDK の型が生成された版に合わせてある。
 */
const API_VERSION = "2026-02-25.clover";

/** Null when no secret key is configured, so the app runs without Stripe. */
export function getStripe(): Stripe | null {
  const secretKey = serverEnv.stripe.secretKey();
  if (!secretKey) return null;
  if (!client) {
    client = new Stripe(secretKey, {
      apiVersion: API_VERSION,
      typescript: true,
      // サーバーレスでは一時的なネットワーク断が起きる。決済作成を
      // 取りこぼさないよう SDK 側で再試行させる（冪等キーと併用）。
      maxNetworkRetries: 2,
      appInfo: { name: "onemake-web" },
    });
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
