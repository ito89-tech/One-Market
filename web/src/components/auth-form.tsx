"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Field, TextInput } from "@/components/form";
import { Alert, Button, Card } from "@/components/ui";

type Mode = "register" | "login";

type ApiResult =
  | {
      ok: true;
      data: { pendingVerification?: boolean; devVerifyUrl?: string | null };
    }
  | {
      ok: false;
      error: { code: string; message: string; details?: Record<string, string> };
    };

type StatusResult =
  | { ok: true; data: { pending: boolean; signedIn: boolean } }
  | { ok: false; error: { message: string } };

const COPY = {
  register: {
    title: "会員登録",
    submit: "登録して診断結果を見る",
    endpoint: "/api/auth/register",
    switchText: "すでにアカウントをお持ちですか？",
    switchLabel: "ログイン",
    switchHref: "/login",
  },
  login: {
    title: "ログイン",
    submit: "ログイン",
    endpoint: "/api/auth/login",
    switchText: "アカウントをお持ちでない方は",
    switchLabel: "会員登録",
    switchHref: "/signup",
  },
} as const;

const POLL_MS = 2_000;

export function AuthForm({ mode, next }: { mode: Mode; next: string }) {
  const copy = COPY[mode];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingEmail, setAwaitingEmail] = useState(false);
  const [devVerifyUrl, setDevVerifyUrl] = useState<string | null>(null);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  // The link may be opened on a phone, so this browser watches for the
  // confirmation instead of asking the user to come back and log in again.
  useEffect(() => {
    if (!awaitingEmail) return;

    let active = true;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const response = await fetch("/api/auth/verify/status", {
            cache: "no-store",
          });
          const body = (await response.json()) as StatusResult;
          if (!active) return;
          if (body.ok && body.data.signedIn) {
            clearInterval(timer);
            window.location.assign(next);
          }
        } catch {
          /* keep polling */
        }
      })();
    }, POLL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [awaitingEmail, next]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFormError(null);

    try {
      const response = await fetch(copy.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          mode === "register"
            ? { email, password, displayName, next }
            : { email, password, next },
        ),
      });
      const body = (await response.json()) as ApiResult;

      if (!body.ok) {
        if (body.error.details) setErrors(body.error.details);
        setFormError(body.error.message);
        setSubmitting(false);
        return;
      }

      if (body.data.pendingVerification) {
        setDevVerifyUrl(body.data.devVerifyUrl ?? null);
        setAwaitingEmail(true);
        setSubmitting(false);
        return;
      }

      // Full navigation rather than router.push: the session cookie has just
      // changed, and a client-side transition can still serve the router cache
      // rendered for the logged-out visitor.
      window.location.assign(next);
    } catch {
      setFormError("通信に失敗しました。時間をおいて再度お試しください。");
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setResendNotice(null);
    try {
      const response = await fetch("/api/auth/verify/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, next }),
      });
      const body = (await response.json()) as ApiResult;
      if (!body.ok) {
        setResendNotice(body.error.message);
        return;
      }
      setDevVerifyUrl(body.data.devVerifyUrl ?? null);
      setResendNotice("確認メールを再送しました。");
    } catch {
      setResendNotice("再送できませんでした。時間をおいて再度お試しください。");
    } finally {
      setResending(false);
    }
  }

  if (awaitingEmail) {
    return (
      <Card className="text-center">
        <h1 className="text-lg font-bold text-ink-900">
          メールをご確認ください
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          <span className="font-bold break-all text-ink-700">{email}</span>{" "}
          に確認メールをお送りしました。メール内のリンクを開くと確認が完了し、この画面が自動で次に進みます。
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          リンクの有効期限は30分です。スマートフォンで開いても、この画面はそのままお待ちください。
        </p>

        {devVerifyUrl ? (
          <div className="mt-5 text-left">
            <Alert tone="warning" title="開発環境のみ">
              メール送信が未設定のため、確認リンクを表示しています。
              <a
                href={devVerifyUrl}
                className="mt-2 block font-bold break-all text-brand-600 underline underline-offset-2"
              >
                {devVerifyUrl}
              </a>
            </Alert>
          </div>
        ) : null}

        {resendNotice ? (
          <div className="mt-5 text-left">
            <Alert tone="info">{resendNotice}</Alert>
          </div>
        ) : null}

        <div className="mt-6 space-y-3">
          <Button
            type="button"
            variant="quiet"
            className="w-full"
            disabled={resending}
            onClick={handleResend}
          >
            {resending ? "送信しています…" : "確認メールを再送する"}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {formError ? <Alert tone="error">{formError}</Alert> : null}

      <Field label="メールアドレス" required error={errors.email}>
        {(props) => (
          <TextInput
            {...props}
            type="email"
            name="email"
            value={email}
            invalid={Boolean(errors.email)}
            autoComplete="email"
            placeholder="you@example.com"
            onChange={(event) => setEmail(event.target.value)}
          />
        )}
      </Field>

      <Field
        label="パスワード"
        required
        hint={mode === "register" ? "8文字以上で設定してください" : undefined}
        error={errors.password}
      >
        {(props) => (
          <TextInput
            {...props}
            type="password"
            name="password"
            value={password}
            invalid={Boolean(errors.password)}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            onChange={(event) => setPassword(event.target.value)}
          />
        )}
      </Field>

      {mode === "register" ? (
        <Field label="お名前" hint="任意です。結果画面でのご挨拶に使います。" error={errors.displayName}>
          {(props) => (
            <TextInput
              {...props}
              name="displayName"
              value={displayName}
              invalid={Boolean(errors.displayName)}
              autoComplete="name"
              placeholder="山田"
              onChange={(event) => setDisplayName(event.target.value)}
            />
          )}
        </Field>
      ) : null}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "処理しています…" : copy.submit}
      </Button>

      <p className="text-center text-sm text-ink-500">
        {copy.switchText}{" "}
        <Link
          href={`${copy.switchHref}?next=${encodeURIComponent(next)}`}
          className="font-bold text-brand-600 underline underline-offset-2"
        >
          {copy.switchLabel}
        </Link>
      </p>
    </form>
  );
}
