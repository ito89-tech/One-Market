"use client";

import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";

import { cx } from "./ui";

const controlBase =
  "w-full rounded-[10px] border bg-white px-4 text-[16px] text-ink-900 placeholder:text-ink-300 min-h-12";

export function Field({
  label,
  hint,
  error,
  required,
  suffix,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  suffix?: string;
  children: (props: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean | undefined;
  }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-ink-900">
        {label}
        {required ? (
          <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-700">
            必須
          </span>
        ) : null}
      </label>

      {hint ? (
        <p id={hintId} className="mt-1 text-xs leading-relaxed text-ink-500">
          {hint}
        </p>
      ) : null}

      <div className="relative mt-2">
        {children({
          id,
          "aria-describedby": describedBy,
          "aria-invalid": error ? true : undefined,
        })}
        {suffix ? (
          <span
            aria-hidden
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-ink-500"
          >
            {suffix}
          </span>
        ) : null}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-sm font-bold text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  invalid,
  hasSuffix,
  className,
  ...props
}: ComponentProps<"input"> & { invalid?: boolean; hasSuffix?: boolean }) {
  return (
    <input
      {...props}
      className={cx(
        controlBase,
        invalid ? "border-red-500" : "border-[var(--color-line)]",
        hasSuffix && "pr-16",
        className,
      )}
    />
  );
}

export function Select({
  invalid,
  className,
  children,
  ...props
}: ComponentProps<"select"> & { invalid?: boolean }) {
  return (
    <select
      {...props}
      className={cx(
        controlBase,
        "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 12 8%22><path fill=%22%235a686f%22 d=%22M1 1l5 5 5-5%22/></svg>')] bg-[length:12px_8px] bg-[right_1rem_center] bg-no-repeat pr-10",
        invalid ? "border-red-500" : "border-[var(--color-line)]",
        className,
      )}
    >
      {children}
    </select>
  );
}

export function FormStep({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="rounded-2xl border border-[var(--color-line)] bg-white p-4 sm:p-7">
      <legend className="flex max-w-full items-center gap-3 px-1">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white">
          {step}
        </span>
        <span className="text-base font-bold text-ink-900">{title}</span>
      </legend>
      {description ? (
        <p className="mt-3 text-sm leading-relaxed text-ink-500">{description}</p>
      ) : null}
      <div className="mt-5 space-y-5">{children}</div>
    </fieldset>
  );
}
