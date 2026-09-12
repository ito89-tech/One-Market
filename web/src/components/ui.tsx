import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------- レイアウト */

export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mx-auto w-full max-w-[1080px] px-4 sm:px-6", className)}>
      {children}
    </div>
  );
}

export function Section({
  children,
  muted,
  id,
  className,
}: {
  children: ReactNode;
  muted?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cx(
        "py-12 sm:py-20",
        muted && "bg-[var(--color-surface-muted)]",
        className,
      )}
    >
      <Container>{children}</Container>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-8 text-center sm:mb-12">
      {eyebrow ? (
        <p className="mb-2 text-sm font-bold tracking-wide text-brand-600">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="text-2xl font-bold leading-snug text-ink-900 sm:text-3xl">
        {title}
      </h2>
      {description ? (
        <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-500">
          {description}
        </p>
      ) : null}
    </header>
  );
}

/* ------------------------------------------------------------------ 部品 */

const buttonBase =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-bold transition-[color,background-color,border-color,transform,box-shadow] duration-200 hover:-translate-y-px active:translate-y-0 touch-manipulation disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0";

const buttonVariants = {
  primary: "bg-brand-500 text-white hover:bg-brand-600",
  accent: "bg-accent-500 text-white hover:bg-accent-600",
  secondary:
    "border border-brand-400 bg-brand-400 text-white hover:bg-brand-500",
  quiet:
    "border border-brand-400 bg-white text-brand-600 hover:bg-brand-50",
  inverse:
    "border border-white bg-white text-brand-700 hover:bg-brand-50 hover:text-brand-800",
} as const;

type ButtonVariant = keyof typeof buttonVariants;

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={cx(buttonBase, buttonVariants[variant], className)}
    />
  );
}

export function LinkButton({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return (
    <Link
      {...props}
      className={cx(buttonBase, buttonVariants[variant], className)}
    />
  );
}

export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "article";
}) {
  return (
    <Tag
      className={cx(
        "rounded-2xl border border-[var(--color-line)] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,28,0.04)] sm:p-7",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "error" | "success";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: "border-brand-200 bg-brand-50 text-brand-800",
    warning: "border-amber-300 bg-amber-50 text-amber-900",
    error: "border-red-300 bg-red-50 text-red-900",
    success: "border-emerald-300 bg-emerald-50 text-emerald-900",
  } as const;

  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cx("rounded-xl border px-4 py-3 text-sm", tones[tone])}
    >
      {title ? <p className="font-bold">{title}</p> : null}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "under" | "fair" | "over";
}) {
  const tones = {
    neutral: "bg-[var(--color-surface-muted)] text-ink-700",
    brand: "bg-brand-50 text-brand-700",
    under: "bg-[var(--color-judge-under)] text-white",
    fair: "bg-[var(--color-judge-fair)] text-white",
    over: "bg-[var(--color-judge-over)] text-white",
  } as const;

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-3 py-1 text-sm font-bold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function DefinitionRow({
  term,
  children,
}: {
  term: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-[var(--color-line)] py-3 last:border-b-0 sm:flex sm:items-baseline sm:justify-between sm:gap-x-4 sm:gap-y-1">
      <dt className="text-sm text-ink-500">{term}</dt>
      <dd className="min-w-0 break-words text-[15px] font-bold text-ink-900 sm:text-right">
        {children}
      </dd>
    </div>
  );
}
