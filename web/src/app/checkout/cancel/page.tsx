import type { Metadata } from "next";

import { Card, Container, LinkButton } from "@/components/ui";

export const metadata: Metadata = { title: "お支払いの中止" };

export default function CheckoutCancelPage() {
  return (
    <Container className="py-14 sm:py-20">
      <div className="mx-auto max-w-md">
        <Card className="text-center">
          <h1 className="text-xl font-bold text-ink-900">
            お支払いを中止しました
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-500">
            料金は発生していません。入力いただいた物件情報は保持しています。
          </p>
          <div className="mt-6 space-y-3">
            <LinkButton href="/mypage" className="w-full">
              マイページへ
            </LinkButton>
            <LinkButton href="/" variant="quiet" className="w-full">
              トップへ戻る
            </LinkButton>
          </div>
        </Card>
      </div>
    </Container>
  );
}
