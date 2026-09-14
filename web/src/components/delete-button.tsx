"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { cx } from "@/components/ui";

type ApiResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { message: string } };

/**
 * Two-step delete: the first click swaps the label for an explicit confirm, so
 * there is no destructive action behind a single tap and no browser dialog to
 * suppress. Used for diagnosis history and for admin user removal.
 */
export function DeleteButton({
  endpoint,
  label = "削除",
  confirmLabel = "本当に削除",
  pendingLabel = "削除しています…",
  size = "sm",
  redirectTo,
  onDeleted,
}: {
  endpoint: string;
  label?: string;
  confirmLabel?: string;
  pendingLabel?: string;
  size?: "sm" | "md";
  redirectTo?: string;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!confirming) {
      setConfirming(true);
      setError(null);
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const body = (await response.json()) as ApiResult;
      if (!body.ok) {
        setError(body.error.message);
        setConfirming(false);
        return;
      }
      onDeleted?.();
      if (redirectTo) {
        window.location.assign(redirectTo);
        return;
      }
      router.refresh();
    } catch {
      setError("削除できませんでした。時間をおいて再度お試しください。");
      setConfirming(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={handleClick}
          disabled={pending}
          className={cx(
            "inline-flex items-center justify-center rounded-full border font-bold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            size === "sm"
              ? "min-h-9 px-4 text-xs"
              : "min-h-12 px-5 text-[15px]",
            confirming
              ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
              : "border-[var(--color-line)] bg-white text-ink-500 hover:border-red-400 hover:text-red-700",
          )}
        >
          {pending ? pendingLabel : confirming ? confirmLabel : label}
        </button>
        {confirming && !pending ? (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-xs font-bold text-ink-500 underline underline-offset-2"
          >
            やめる
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-xs font-bold text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
