import Link from "next/link";

/** One-room building mark. Not a heart or speech-bubble. */
export function LogoMark({
  className = "h-8 w-8",
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        rx="8"
        className={onDark ? "fill-white" : "fill-brand-500"}
      />
      <path
        d="M8.5 24V12.2L16 7.4l7.5 4.8V24H8.5z"
        className={onDark ? "fill-brand-500" : "fill-white"}
      />
      <rect
        x="12.2"
        y="13.2"
        width="3.1"
        height="3.1"
        rx="0.6"
        className={onDark ? "fill-white" : "fill-brand-500"}
      />
      <rect
        x="16.7"
        y="13.2"
        width="3.1"
        height="3.1"
        rx="0.6"
        className={onDark ? "fill-white" : "fill-brand-500"}
      />
      <rect
        x="12.2"
        y="17.6"
        width="3.1"
        height="3.1"
        rx="0.6"
        className={onDark ? "fill-white" : "fill-brand-500"}
      />
      <rect
        x="16.7"
        y="17.6"
        width="3.1"
        height="6.4"
        rx="0.6"
        className={onDark ? "fill-white" : "fill-brand-500"}
      />
    </svg>
  );
}

export function Logo({
  wordmarkClassName = "text-ink-900",
}: {
  wordmarkClassName?: string;
}) {
  return (
    <Link
      href="/"
      className="flex min-w-0 items-center gap-2 whitespace-nowrap text-lg font-bold tracking-tight sm:text-xl"
    >
      <LogoMark />
      <span className={wordmarkClassName}>ワンマケ</span>
    </Link>
  );
}
