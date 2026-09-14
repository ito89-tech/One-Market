"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Alert, Card, LinkButton } from "@/components/ui";
import { clearDraft, loadDraft } from "@/lib/draft";

type Phase =
  | "waiting_payment"
  | "running_diagnosis"
  | "error";

type ConfirmResult =
  | {
      ok: true;
      data: { ready: boolean; reason?: string };
    }
  | { ok: false; error: { message: string } };

type MeResult =
  | {
      ok: true;
      data: { usage: { canDiagnose: boolean } };
    }
  | { ok: false; error: { message: string } };

type DiagnosisResult =
  | { ok: true; data: { id: string } }
  | { ok: false; error: { code: string; message: string } };

const POLL_MS = 1_000;
const MAX_WAIT_MS = 45_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Prefer confirming the Stripe session (grants credits if webhook lagged),
 * then fall back to /api/me so mock checkouts without a session id still work.
 */
async function waitUntilCanDiagnose(sessionId: string | null): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < MAX_WAIT_MS) {
    if (sessionId) {
      try {
        const response = await fetch("/api/stripe/checkout/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const body = (await response.json()) as ConfirmResult;
        if (body.ok && body.data.ready) return true;
      } catch {
        /* keep polling */
      }
    }

    try {
      const response = await fetch("/api/me", { cache: "no-store" });
      const body = (await response.json()) as MeResult;
      if (body.ok && body.data.usage.canDiagnose) return true;
    } catch {
      /* keep polling */
    }

    await sleep(POLL_MS);
  }
  return false;
}

/**
 * After Stripe (or mock) redirects here, entitlement may still be catching up
 * via webhook. Confirm the session from Stripe as a backup, then run the
 * property draft and land on the result page.
 */
export function CheckoutSuccessContinue({
  sessionId,
  initiallyUsable,
  mock,
}: {
  sessionId: string | null;
  initiallyUsable: boolean;
  mock: boolean;
}) {
  const router = useRouter();
  const started = useRef(false);
  const [phase, setPhase] = useState<Phase>(
    initiallyUsable && !sessionId ? "running_diagnosis" : "waiting_payment",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        // Always confirm when Stripe gave us a session id — webhook may not
        // have run yet (or at all). For mock / already-usable without a
        // session, skip straight to diagnosis.
        const needsWait = Boolean(sessionId) || !initiallyUsable;
        if (needsWait) {
          setPhase("waiting_payment");
          const ready = await waitUntilCanDiagnose(sessionId);
          if (!ready) {
            setPhase("error");
            setError(
              "決済の確認に時間がかかっています。しばらくしてからマイページをご確認ください。",
            );
            return;
          }
        }

        const draft = loadDraft();
        if (!draft) {
          router.replace("/mypage");
          return;
        }

        setPhase("running_diagnosis");
        const response = await fetch("/api/diagnosis", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(draft),
        });
        const body = (await response.json()) as DiagnosisResult;
        if (!body.ok) {
          setPhase("error");
          setError(body.error.message);
          return;
        }

        clearDraft();
        router.replace(`/diagnosis/${body.data.id}`);
      } catch {
        setPhase("error");
        setError(
          "診断の再開に失敗しました。時間をおいて再度お試しください。",
        );
      }
    })();
  }, [initiallyUsable, router, sessionId]);

  if (phase === "error") {
    return (
      <Card className="text-center">
        <h1 className="text-xl font-bold text-ink-900">
          お手続きありがとうございます
        </h1>
        {mock ? (
          <div className="mt-5 text-left">
            <Alert tone="warning" title="TEST ONLY">
              これは開発環境用のテスト決済です。本番の料金は発生していません。
            </Alert>
          </div>
        ) : null}
        <div className="mt-5 text-left">
          <Alert tone="error">{error}</Alert>
        </div>
        <div className="mt-6 space-y-3">
          <LinkButton href="/diagnosis/run" className="w-full">
            入力済みの物件を診断する
          </LinkButton>
          <LinkButton href="/mypage" variant="quiet" className="w-full">
            マイページへ
          </LinkButton>
        </div>
      </Card>
    );
  }

  return (
    <Card className="text-center">
      <h1 className="text-xl font-bold text-ink-900">
        お手続きありがとうございます
      </h1>
      {mock ? (
        <div className="mt-5 text-left">
          <Alert tone="warning" title="TEST ONLY">
            これは開発環境用のテスト決済です。本番の料金は発生していません。
          </Alert>
        </div>
      ) : null}
      <p
        aria-live="polite"
        className="mt-3 text-sm leading-relaxed text-ink-500"
      >
        {phase === "waiting_payment"
          ? "決済を確認しています。このままお待ちください…"
          : "入力済みの物件を診断しています…"}
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
