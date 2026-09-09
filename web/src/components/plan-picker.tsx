"use client";

import { useState } from "react";

import { BILLING_PLAN_LIST, type PlanKey } from "@/config/plans";
import { Alert, Button } from "@/components/ui";

export function PlanPicker({
  onSelect,
  pending,
  error,
}: {
  onSelect: (planKey: PlanKey) => void;
  pending: boolean;
  error: string | null;
}) {
  const [selected, setSelected] = useState<PlanKey>("one_time");

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-bold text-ink-900">
          料金プラン
        </legend>
        {BILLING_PLAN_LIST.map((plan) => {
          const active = selected === plan.key;
          return (
            <label
              key={plan.key}
              className={`block cursor-pointer rounded-2xl border p-4 transition ${
                active
                  ? "border-brand-500 bg-brand-50"
                  : "border-[var(--color-line)] bg-white"
              }`}
            >
              <input
                type="radio"
                name="planKey"
                value={plan.key}
                checked={active}
                className="sr-only"
                onChange={() => setSelected(plan.key)}
              />
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold text-ink-900">{plan.name}</span>
                <span className="text-sm font-bold text-brand-700">
                  {plan.priceLabel}
                </span>
              </span>
              <span className="mt-2 block text-sm leading-relaxed text-ink-500">
                {plan.description}
              </span>
            </label>
          );
        })}
      </fieldset>
      <Button
        onClick={() => onSelect(selected)}
        disabled={pending}
        className="w-full"
      >
        {pending ? "決済ページへ移動しています…" : "このプランでお支払いに進む"}
      </Button>
    </div>
  );
}
