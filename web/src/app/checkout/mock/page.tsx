import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MockCheckoutForm } from "@/components/mock-checkout-form";
import { Alert, Container, LinkButton } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { isMockPaymentsAllowed } from "@/lib/env";

export const metadata: Metadata = { title: "テスト決済" };
export const dynamic = "force-dynamic";

export default async function MockCheckoutPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/checkout/mock");

  if (!isMockPaymentsAllowed()) {
    return (
      <Container className="py-14 sm:py-20">
        <div className="mx-auto max-w-md space-y-4">
          <Alert tone="error" title="テスト決済は使えません">
            この環境では Mock Payment が無効です。本番では Stripe を使います。
          </Alert>
          <LinkButton href="/mypage" className="w-full">
            マイページへ
          </LinkButton>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-14 sm:py-20">
      <div className="mx-auto max-w-md">
        <Suspense>
          <MockCheckoutForm />
        </Suspense>
      </div>
    </Container>
  );
}
