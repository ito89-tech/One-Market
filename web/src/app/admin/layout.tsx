import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";

// Operational data is never cached, and the build must not try to prerender it.
export const dynamic = "force-dynamic";

const TABS = [
  { href: "/admin", label: "概要" },
  { href: "/admin/users", label: "ユーザー" },
  { href: "/admin/diagnoses", label: "診断" },
  { href: "/admin/payments", label: "決済" },
  { href: "/admin/data", label: "収益率データ" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  // 404 rather than 403: don't confirm that an admin area exists.
  if (!user || user.role !== "ADMIN") notFound();

  return (
    <Container className="py-8 sm:py-10">
      <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">管理画面</h1>

      <nav aria-label="管理メニュー" className="mt-5 border-b border-[var(--color-line)]">
        <ul className="-mb-px flex gap-x-5 overflow-x-auto text-sm font-bold whitespace-nowrap">
          {TABS.map((tab) => (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className="inline-block border-b-2 border-transparent py-3 text-ink-700 hover:border-brand-400 hover:text-brand-600"
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-8">{children}</div>
    </Container>
  );
}
