"use client";

import { useState } from "react";

import { Button } from "@/components/ui";

export function LogoutButton() {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // Full navigation so no router-cache entry rendered for the signed-in
    // visitor survives the logout.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- must drop the RSC cache
    window.location.assign("/");
  }

  return (
    <Button
      variant="quiet"
      onClick={handleClick}
      disabled={pending}
      className="!min-h-10 !px-4 !text-sm"
    >
      {pending ? "処理中…" : "ログアウト"}
    </Button>
  );
}
