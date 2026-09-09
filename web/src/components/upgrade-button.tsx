"use client";

import { useState } from "react";

import { PlanPicker } from "@/components/plan-picker";
import type { PlanKey } from "@/config/plans";

async function startCheckout(planKey: PlanKey): Promise<string> {
  const response = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planKey }),
  });
  const body = (await response.json()) as
    | { ok: true; data: { url: string } }
    | { ok: false; error: { message: string } };
  if (!body.ok) throw new Error(body.error.message);
  return body.data.url;
}

export function UpgradeButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(planKey: PlanKey) {
    setPending(true);
    setError(null);
    try {
      window.location.href = await startCheckout(planKey);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "決済ページを開けませんでした。時間をおいて再度お試しください。",
      );
      setPending(false);
    }
  }

  return (
    <PlanPicker onSelect={handleSelect} pending={pending} error={error} />
  );
}
