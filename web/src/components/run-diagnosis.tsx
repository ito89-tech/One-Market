"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { PlanPicker } from "@/components/plan-picker";
import { Alert, Card, LinkButton } from "@/components/ui";
import type { PlanKey } from "@/config/plans";
import {
  clearDraft,
  getDraftSnapshot,
  getServerDraftSnapshot,
  subscribeToDraft,
} from "@/lib/draft";

type State =
  | { phase: "working" }
  | { phase: "redirecting" }
  | { phase: "paywall"; message: string }
  | { phase: "error"; message: string };

type ApiResult =
  | { ok: true; data: { id: string } }
  | { ok: false; error: { code: string; message: string } };

export function RunDiagnosis({ paidFlowEnabled }: { paidFlowEnabled: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "working" });
  const [checkoutPending, setCheckoutPending] = useState(false);
  // React mounts effects twice in dev; without this the diagnosis would run
  // (and consume an entitlement) twice.
  const started = useRef(false);

  // `undefined` until hydration finishes, `null` once we know there is no
  // draft to diagnose.
  const draft = useSyncExternalStore(
    subscribeToDraft,
    getDraftSnapshot,
    getServerDraftSnapshot,
  );

  useEffect(() => {
    if (started.current || !draft) return;
    started.current = true;

    fetch("/api/diagnosis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    })
      .then((response) => response.json() as Promise<ApiResult>)
      .then((body) => {
        if (body.ok) {
          // Order matters: leaving "working" before the draft disappears keeps
          // the empty-draft screen from flashing during the redirect.
          setState({ phase: "redirecting" });
          clearDraft();
          router.replace(`/diagnosis/${body.data.id}`);
          return;
        }
        if (body.error.code === "PAYMENT_REQUIRED") {
          setState({ phase: "paywall", message: body.error.message });
          return;
        }
        setState({ phase: "error", message: body.error.message });
      })
      .catch(() =>
        setState({
          phase: "error",
          message: "通信に失敗しました。時間をおいて再度お試しください。",
        }),
      );
  }, [draft, router]);

  async function startCheckout(planKey: PlanKey) {
    setCheckoutPending(true);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      const body = (await response.json()) as
        | { ok: true; data: { url: string } }
        | { ok: false; error: { message: string } };
      if (body.ok) {
        window.location.href = body.data.url;
        return;
      }
      setState({ phase: "error", message: body.error.message });
    } catch {
      setState({
        phase: "error",
        message: "決済ページを開けませんでした。時間をおいて再度お試しください。",
      });
    } finally {
      setCheckoutPending(false);
    }
  }

  if (state.phase === "working" && draft === null) {
    return (
      <Card className="text-center">
        <h1 className="text-lg font-bold text-ink-900">
          物件情報が見つかりませんでした
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          お手数ですが、もう一度物件情報を入力してください。
        </p>
        <div className="mt-6">
          <LinkButton href="/diagnosis/new" className="w-full">
            物件情報を入力する
          </LinkButton>
        </div>
      </Card>
    );
  }

  if (state.phase === "working" || state.phase === "redirecting") {
    return (
      <Card className="text-center">
        <p
          aria-live="polite"
          className="text-base font-bold text-ink-900"
        >
          相場を確認しています…
        </p>
        <p className="mt-2 text-sm text-ink-500">
          このまましばらくお待ちください。
        </p>
        <div
          aria-hidden
          className="mx-auto mt-6 h-1.5 w-40 overflow-hidden rounded-full bg-[var(--color-surface-muted)]"
        >
          <div className="h-full w-1/2 animate-pulse rounded-full bg-brand-400" />
        </div>
      </Card>
    );
  }

  if (state.phase === "paywall") {
    return (
      <Card>
        <h1 className="text-lg font-bold text-ink-900">
          2回目以降の診断は有料です
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">{state.message}</p>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          入力いただいた物件情報は保持しています。お手続き後、そのまま診断できます。
        </p>

        <div className="mt-6 space-y-3">
          {paidFlowEnabled ? (
            <PlanPicker
              onSelect={startCheckout}
              pending={checkoutPending}
              error={null}
            />
          ) : (
            <Alert tone="info">
              有料診断は現在準備中です。ご利用いただけるようになりましたら、
              マイページにてご案内いたします。
            </Alert>
          )}
          <LinkButton href="/mypage" variant="quiet" className="w-full">
            マイページへ
          </LinkButton>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="text-lg font-bold text-ink-900">診断できませんでした</h1>
      <div className="mt-4">
        <Alert tone="error">{state.message}</Alert>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-ink-500">
        無料診断のご利用回数は消費されていません。
      </p>
      <div className="mt-6 space-y-3">
        <LinkButton href="/diagnosis/new" className="w-full">
          条件を変えて入力し直す
        </LinkButton>
        <LinkButton href="/mypage" variant="quiet" className="w-full">
          マイページへ
        </LinkButton>
      </div>
    </Card>
  );
}
