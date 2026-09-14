"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { PlanPicker } from "@/components/plan-picker";
import { Alert, Button, Card, LinkButton } from "@/components/ui";
import { BILLING_PLANS, isPlanKey, type PlanKey } from "@/config/plans";

export function MockCheckoutForm() {
  const searchParams = useSearchParams();
  const initial = searchParams.get("plan");
  const selectedPlan: PlanKey = isPlanKey(initial) ? initial : "one_time";
  const [planKey, setPlanKey] = useState<PlanKey>(selectedPlan);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(!isPlanKey(initial));

  const plan = BILLING_PLANS[planKey];

  async function succeed() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/payments/mock/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      const body = (await response.json()) as
        | { ok: true; data: { next: string } }
        | { ok: false; error: { message: string } };
      if (body.ok) {
        window.location.assign(body.data.next);
        return;
      }
      setError(body.error.message);
    } catch {
      setError("お支払いを完了できませんでした。時間をおいて再度お試しください。");
    } finally {
      setPending(false);
    }
  }

  if (choosing) {
    return (
      <Card>
        <h1 className="mt-1 text-xl font-bold text-ink-900">お支払い</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          プランを選んでお支払いください。
        </p>
        <div className="mt-5">
          <PlanPicker
            pending={false}
            error={null}
            onSelect={(key) => {
              setPlanKey(key);
              setChoosing(false);
            }}
          />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="text-xl font-bold text-ink-900">お支払い</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-500">
        {plan.name}（{plan.priceLabel}）でお支払いを完了します。
      </p>

      {error ? (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        <Button onClick={succeed} disabled={pending} className="w-full">
          {pending ? "反映しています…" : "お支払いを完了する"}
        </Button>
        <Button
          type="button"
          variant="quiet"
          className="w-full"
          onClick={() => setChoosing(true)}
        >
          プランを選び直す
        </Button>
        <LinkButton href="/checkout/cancel" variant="quiet" className="w-full">
          やめる
        </LinkButton>
      </div>
    </Card>
  );
}
