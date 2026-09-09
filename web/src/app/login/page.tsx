import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { Card, Container } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { safeNext } from "@/lib/next-param";

export const metadata: Metadata = { title: "ログイン" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = safeNext(next);

  if (await getCurrentUser()) {
    redirect(destination);
  }

  return (
    <Container className="py-10 sm:py-16">
      <div className="mx-auto max-w-md">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-ink-900">ログイン</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-500">
            登録済みのメールアドレスとパスワードを入力してください。
          </p>
        </header>

        <Card>
          <AuthForm mode="login" next={destination} />
        </Card>
      </div>
    </Container>
  );
}
