/**
 * Confirmed billing plans. Stripe Price IDs stay in environment variables;
 * this module only describes what each plan means.
 */
export const PLAN_KEYS = [
  "one_time",
  "monthly_5",
  "monthly_unlimited",
] as const;

export type PlanKey = (typeof PLAN_KEYS)[number];

export type BillingPlan = {
  key: PlanKey;
  name: string;
  priceYen: number;
  priceLabel: string;
  description: string;
  checkoutMode: "payment" | "subscription";
  monthlyLimit: number | null;
  creditsPerPurchase: number;
};

export const BILLING_PLANS: Record<PlanKey, BillingPlan> = {
  one_time: {
    key: "one_time",
    name: "1回プラン",
    priceYen: 1100,
    priceLabel: "1,100円 / 1回",
    description: "購入ごとに有料診断を1回ご利用いただけます。",
    checkoutMode: "payment",
    monthlyLimit: null,
    creditsPerPurchase: 1,
  },
  monthly_5: {
    key: "monthly_5",
    name: "月5回までプラン",
    priceYen: 2200,
    priceLabel: "2,200円 / 月",
    description: "契約期間中、1か月につき最大5回まで診断できます。",
    checkoutMode: "subscription",
    monthlyLimit: 5,
    creditsPerPurchase: 0,
  },
  monthly_unlimited: {
    key: "monthly_unlimited",
    name: "回数無制限プラン",
    priceYen: 5500,
    priceLabel: "5,500円 / 月",
    description: "契約期間中、診断回数の制限はありません。",
    checkoutMode: "subscription",
    monthlyLimit: null,
    creditsPerPurchase: 0,
  },
};

export const BILLING_PLAN_LIST: BillingPlan[] = PLAN_KEYS.map(
  (key) => BILLING_PLANS[key],
);

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && PLAN_KEYS.includes(value as PlanKey);
}
