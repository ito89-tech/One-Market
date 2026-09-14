"use client";

import Link from "next/link";
import { useState } from "react";

import { Field, TextInput } from "@/components/form";
import { Alert, Button } from "@/components/ui";

type Mode = "register" | "login";

type ApiResult =
  | { ok: true; data: unknown }
  | {
      ok: false;
      error: { code: string; message: string; details?: Record<string, string> };
    };

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

export function AuthForm({ mode, next }: { mode: Mode; next: string }) {
  const copy = COPY[mode];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
          mode === "register" ? { email, password, displayName } : { email, password },
        ),
      });
      const body = (await response.json()) as ApiResult;

      if (!body.ok) {
        if (body.error.details) setErrors(body.error.details);
        setFormError(body.error.message);
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
