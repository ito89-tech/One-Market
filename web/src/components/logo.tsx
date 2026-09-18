import Image from "next/image";
import Link from "next/link";

const MARK = {
  src: "/images/logo-mark.png",
  width: 636,
  height: 508,
} as const;

const LOCKUP = {
  src: "/images/logo-lockup.png",
  width: 810,
  height: 704,
  alt: "ワンマケ 1R Market",
} as const;

export function Logo({ size = "header" }: { size?: "header" | "footer" }) {
  if (size === "footer") {
    return (
      <Link
        href="/"
        aria-label="ワンマケ ホーム"
        className="inline-flex min-w-0 shrink-0 items-center"
      >
        <Image
          {...LOCKUP}
          sizes="160px"
          style={{ width: "auto" }}
          className="h-20 w-auto max-w-[10rem] object-contain object-left sm:h-24 sm:max-w-[12rem]"
        />
      </Link>
    );
  }

  return (
    <Link
      href="/"
      aria-label="ワンマケ ホーム"
      className="flex min-w-0 shrink-0 items-center gap-2"
    >
      <Image
        {...MARK}
        alt=""
        priority
        sizes="40px"
        style={{ width: "auto" }}
        className="h-8 w-auto object-contain sm:h-9"
      />
      <span className="text-lg font-bold tracking-tight text-ink-900 sm:text-xl">
        ワンマケ
      </span>
    </Link>
  );
}
