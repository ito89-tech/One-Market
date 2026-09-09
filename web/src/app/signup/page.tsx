import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { Card, Container } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { safeNext } from "@/lib/next-param";

export const metadata: Metadata = { title: "会員登録" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = safeNext(next);

  if (await getCurrentUser()) {
    redirect(destination);
  }

  const fromDiagnosis = destination.startsWith("/diagnosis");

  return (
    <Container className="py-10 sm:py-16">
      <div className="mx-auto max-w-md">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-ink-900">会員登録</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-500">
            {fromDiagnosis
              ? "入力いただいた物件情報はそのまま引き継がれます。登録後すぐに診断結果をご覧いただけます。"
              : "メールアドレスとパスワードだけで登録できます。"}
          </p>
        </header>

        <Card>
          <AuthForm mode="register" next={destination} />
        </Card>

        <p className="mt-6 text-center text-xs leading-relaxed text-ink-300">
          初回の診断は無料でご利用いただけます。
          <br />
          診断結果は参考情報であり、売買価格を保証するものではありません。
        </p>
      </div>
    </Container>
  );
}
