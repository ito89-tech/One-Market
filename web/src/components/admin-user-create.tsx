"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Field, Select, TextInput } from "@/components/form";
import { Alert, Button, Card } from "@/components/ui";

type ApiResult =
  | { ok: true; data: { email: string } }
  | {
      ok: false;
      error: { message: string; details?: Record<string, string> };
    };

/**
 * Admin-side account creation. Role ADMIN can access /admin even if the
 * address is not listed in ADMIN_EMAILS (that env is the developer bootstrap).
 */
export function AdminUserCreate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"USER" | "ADMIN">("USER");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setEmail("");
    setPassword("");
    setDisplayName("");
    setRole("USER");
    setErrors({});
    setFormError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, displayName, role }),
      });
      const body = (await response.json()) as ApiResult;
      if (!body.ok) {
        if (body.error.details) setErrors(body.error.details);
        setFormError(body.error.message);
        return;
      }
      setNotice(`${body.data.email} を登録しました。`);
      reset();
      setOpen(false);
      router.refresh();
    } catch {
      setFormError("登録できませんでした。時間をおいて再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <div className="space-y-3">
        {notice ? <Alert tone="info">{notice}</Alert> : null}
        <Button type="button" onClick={() => setOpen(true)}>
          ユーザーを登録する
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <h2 className="text-base font-bold text-ink-900">ユーザーの登録</h2>

      <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-5">
        {formError ? <Alert tone="error">{formError}</Alert> : null}

        <Field label="メールアドレス" required error={errors.email}>
          {(props) => (
            <TextInput
              {...props}
              type="email"
              value={email}
              invalid={Boolean(errors.email)}
              autoComplete="off"
              placeholder="user@example.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>

        <Field
          label="初期パスワード"
          required
          hint="8文字以上"
          error={errors.password}
        >
          {(props) => (
            <TextInput
              {...props}
              type="text"
              value={password}
              invalid={Boolean(errors.password)}
              autoComplete="off"
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>

        <Field label="お名前" error={errors.displayName}>
          {(props) => (
            <TextInput
              {...props}
              value={displayName}
              invalid={Boolean(errors.displayName)}
              autoComplete="off"
              placeholder="山田"
              onChange={(event) => setDisplayName(event.target.value)}
            />
          )}
        </Field>

        <Field label="権限" error={errors.role}>
          {(props) => (
            <Select
              {...props}
              value={role}
              onChange={(event) =>
                setRole(event.target.value === "ADMIN" ? "ADMIN" : "USER")
              }
            >
              <option value="USER">一般ユーザー</option>
              <option value="ADMIN">管理者</option>
            </Select>
          )}
        </Field>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? "登録しています…" : "登録する"}
          </Button>
          <Button
            type="button"
            variant="quiet"
            onClick={() => {
              reset();
              setOpen(false);
            }}
          >
            やめる
          </Button>
        </div>
      </form>
    </Card>
  );
}
