"use client";

import { useEffect, useRef, useState } from "react";

import { Alert, Card, LinkButton } from "@/components/ui";

type Phase = "working" | "signed_in" | "other_device" | "error";

type ApiResult =
  | { ok: true; data: { verified: boolean; signedIn: boolean } }
  | { ok: false; error: { message: string } };

/**
 * Landing page for the emailed link. Completing verification has to happen
 * through a POST so the token is not spent by a mail scanner prefetching the
 * URL, and so the session cookie can be written.
 */
export function VerifyToken({ token, next }: { token: string; next: string }) {
  const started = useRef(false);
  const [phase, setPhase] = useState<Phase>("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        const response = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = (await response.json()) as ApiResult;
        if (!body.ok) {
          setPhase("error");
          setError(body.error.message);
          return;
        }
        if (body.data.signedIn) {
          setPhase("signed_in");
          window.location.assign(next);
          return;
        }
        setPhase("other_device");
      } catch {
        setPhase("error");
        setError("通信に失敗しました。時間をおいて再度お試しください。");
      }
    })();
  }, [next, token]);

  if (phase === "error") {
    return (
      <Card className="text-center">
        <h1 className="text-xl font-bold text-ink-900">確認できませんでした</h1>
        <div className="mt-5 text-left">
          <Alert tone="error">{error}</Alert>
        </div>
        <div className="mt-6 space-y-3">
          <LinkButton href="/login" className="w-full">
            ログイン画面へ
          </LinkButton>
        </div>
      </Card>
    );
  }

  if (phase === "other_device") {
    return (
      <Card className="text-center">
        <h1 className="text-xl font-bold text-ink-900">確認が完了しました</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          お手続きを開始した端末の画面に戻ってください。自動でログインが続きます。
        </p>
        <div className="mt-6">
          <LinkButton href="/login" variant="quiet" className="w-full">
            この端末でログインする
          </LinkButton>
        </div>
      </Card>
    );
  }

  return (
    <Card className="text-center">
      <p aria-live="polite" className="text-base font-bold text-ink-900">
        {phase === "signed_in" ? "ログインしています…" : "確認しています…"}
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
