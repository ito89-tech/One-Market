import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RunDiagnosis } from "@/components/run-diagnosis";
import { Container } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { isPaidFlowEnabled } from "@/lib/env";

export const metadata: Metadata = { title: "診断しています" };

export default async function RunDiagnosisPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/signup?next=/diagnosis/run");
  }

  return (
    <Container className="py-14 sm:py-20">
      <div className="mx-auto max-w-md">
        <RunDiagnosis paidFlowEnabled={isPaidFlowEnabled()} />
      </div>
    </Container>
  );
}
