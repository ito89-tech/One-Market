import Image from "next/image";
import Link from "next/link";

import { cx } from "@/components/ui";

const LOGO = {
  src: "/images/logo.png",
  width: 1463,
  height: 486,
  alt: "ワンマケ",
} as const;

export function Logo({ size = "header" }: { size?: "header" | "footer" }) {
  return (
    <Link
      href="/"
      aria-label="ワンマケ ホーム"
      className="inline-flex min-w-0 shrink-0 items-center"
    >
      <Image
        {...LOGO}
        priority={size === "header"}
        sizes="188px"
        style={{ width: "auto" }}
        className={cx(
          "w-auto max-w-[min(100%,11.75rem)] object-contain object-left",
          size === "header" ? "h-9 sm:h-11" : "h-11 sm:h-14",
        )}
      />
    </Link>
  );
}
