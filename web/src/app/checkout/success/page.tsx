import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CheckoutSuccessContinue } from "@/components/checkout-success-continue";
import { Container } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { isMockPaymentsAllowed } from "@/lib/env";
import { hasActiveSubscription } from "@/server/diagnosis";

export const metadata: Metadata = { title: "お支払い完了" };
export const dynamic = "force-dynamic";

/**
 * Stripe only redirects here. Entitlement comes from the webhook-updated DB.
 * The client then auto-runs any pending property draft and lands on the result.
 */
export default async function CheckoutSuccessPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/checkout/success");

  const subscribed = await hasActiveSubscription(user.id);
  const initiallyUsable = user.paidCredits > 0 || subscribed;
  const mock = isMockPaymentsAllowed();

  return (
    <Container className="py-14 sm:py-20">
      <div className="mx-auto max-w-md">
        <CheckoutSuccessContinue
          initiallyUsable={initiallyUsable}
          mock={mock}
        />
      </div>
    </Container>
  );
}
