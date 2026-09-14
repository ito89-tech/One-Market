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
 * Stripe only redirects here. Entitlement is granted by webhook and/or by the
 * client confirming `session_id` against Stripe, then the pending draft runs.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/checkout/success");

  const { session_id: sessionId } = await searchParams;
  const subscribed = await hasActiveSubscription(user.id);
  const initiallyUsable = user.paidCredits > 0 || subscribed;
  const mock = isMockPaymentsAllowed();

  return (
    <Container className="py-14 sm:py-20">
      <div className="mx-auto max-w-md">
        <CheckoutSuccessContinue
          sessionId={sessionId?.startsWith("cs_") ? sessionId : null}
          initiallyUsable={initiallyUsable}
          mock={mock}
        />
      </div>
    </Container>
  );
}
