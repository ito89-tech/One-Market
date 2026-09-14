import type { Metadata } from "next";

import { PropertyForm } from "@/components/property-form";
import { Container } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "物件情報の入力" };

export default async function NewDiagnosisPage() {
  const user = await getCurrentUser();

  return (
    <div className="bg-[var(--color-surface-muted)]">
    <Container className="py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="text-xl font-bold leading-snug text-ink-900 sm:text-3xl">
            物件情報を入力してください
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-500">
            物件資料に書かれている内容をそのまま入力してください。1〜2分ほどで終わります。
          </p>
        </header>

        <PropertyForm isLoggedIn={Boolean(user)} />
      </div>
    </Container>
    </div>
  );
}
