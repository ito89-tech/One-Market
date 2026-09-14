"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { cx, LinkButton } from "@/components/ui";

const SLIDES = [
  {
    src: "/images/hero-full-laptop-v2.png",
    alt: "ノートパソコン全体。画面には判定と相場価格が出ています",
    caption: "パソコンでの診断画面",
    width: 955,
    height: 633,
    eyebrow: "ワンルーム投資物件の価格診断",
    kicker: "初回無料　／　入力は1〜2分",
    title: ["その提案価格は、", "相場と比べてどうですか？"],
    body: "物件の情報を入力するだけで、エリアと築年数から見た相場価格と、提示された価格との差を確認できます。",
  },
  {
    src: "/images/hero-full-phone-v3.png",
    alt: "スマートフォン全体。診断結果の判定と相場価格が表示されています",
    caption: "スマートフォンでの診断画面",
    width: 446,
    height: 964,
    eyebrow: "外出先でも同じ尺度で",
    kicker: "判定　／　相場価格　／　差額",
    title: ["手元の画面でも、", "同じ結果を確認できます"],
    body: "パソコンと同じ判定・相場価格・差額を、スマートフォンから確認できます。入力内容はご本人のアカウントからのみ閲覧できます。",
  },
];

const INTERVAL_MS = 5600;

function Chevron({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={dir === "prev" ? "M10 3.5 5.5 8 10 12.5" : "M6 3.5 10.5 8 6 12.5"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HeroSlider() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useRef(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotion.current = media.matches;
    const onChange = () => {
      reduceMotion.current = media.matches;
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const go = useCallback((next: number | ((current: number) => number)) => {
    setIndex((current) => {
      const resolved = typeof next === "number" ? next : next(current);
      const len = SLIDES.length;
      return ((resolved % len) + len) % len;
    });
  }, []);

  useEffect(() => {
    if (paused) return;
    const delay = reduceMotion.current ? 10000 : INTERVAL_MS;
    const id = window.setInterval(() => {
      go((current) => current + 1);
    }, delay);
    return () => window.clearInterval(id);
  }, [paused, go, index]);

  return (
    <section
      className="relative overflow-hidden bg-brand-50"
      onTouchStart={(event) => {
        touchStartX.current = event.changedTouches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        const end = event.changedTouches[0]?.clientX;
        touchStartX.current = null;
        if (start == null || end == null) return;
        const delta = end - start;
        if (Math.abs(delta) < 48) return;
        go((current) => current + (delta < 0 ? 1 : -1));
      }}
    >
      <div className="mx-auto w-full max-w-[1080px] px-4 py-10 sm:px-6 sm:py-14 lg:py-16">
        <div
          className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12"
          role="region"
          aria-roledescription="carousel"
          aria-label="サービスのご案内"
        >
          <div>
            <div className="hero-copy-stack">
              {SLIDES.map((item, i) => (
                <div
                  key={item.src}
                  className={cx(
                    "hero-copy transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                    i === index
                      ? "is-active z-10 translate-y-0 opacity-100"
                      : "z-0 translate-y-3 opacity-0 pointer-events-none",
                  )}
                  aria-hidden={i !== index}
                >
                  <p className="text-sm font-bold text-brand-700">{item.eyebrow}</p>
                  <p className="mt-2 text-sm font-bold text-brand-600">{item.kicker}</p>
                  {i === 0 ? (
                    <h1 className="hero-title mt-4 text-[28px] font-bold leading-tight text-ink-900 sm:text-[40px]">
                      {item.title[0]}
                      <br />
                      <span className="text-brand-700">{item.title[1]}</span>
                    </h1>
                  ) : (
                    <p className="hero-title mt-4 text-[28px] font-bold leading-tight text-ink-900 sm:text-[40px]">
                      {item.title[0]}
                      <br />
                      <span className="text-brand-700">{item.title[1]}</span>
                    </p>
                  )}
                  <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-700">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="relative z-20 mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <LinkButton href="/diagnosis/new" className="w-full sm:w-auto">
                無料で相場を確認してみる
              </LinkButton>
              <LinkButton href="/login" variant="accent" className="w-full sm:w-auto">
                ログイン
              </LinkButton>
            </div>
          </div>

          <div className="relative lg:self-center">
            <div className="hero-photo-frame">
              {SLIDES.map((item, i) => (
                <div
                  key={item.src}
                  className={cx(
                    "hero-slide-photo",
                    i === index ? "is-active" : "is-idle",
                  )}
                  aria-hidden={i !== index}
                >
                  <Image
                    src={item.src}
                    alt={i === index ? item.alt : ""}
                    fill
                    priority
                    sizes="(min-width: 1024px) 520px, 100vw"
                    className="object-contain"
                  />
                </div>
              ))}
            </div>
            <div className="hero-caption-stack mt-3">
              {SLIDES.map((item, i) => (
                <p
                  key={item.src}
                  className={cx(
                    "text-center text-xs text-ink-300 transition-opacity duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    i === index ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden={i !== index}
                >
                  {item.caption}
                </p>
              ))}
            </div>
          </div>
        </div>

        <div
          className="mt-8 flex items-center justify-center gap-3"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setPaused(false);
            }
          }}
        >
          <button
            type="button"
            aria-label="前の案内"
            className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#44545a] shadow-[0_1px_2px_rgba(16,40,46,0.06),0_8px_20px_rgba(16,40,46,0.08)] ring-1 ring-black/[0.06] transition hover:text-brand-700 hover:shadow-[0_4px_16px_rgba(16,40,46,0.12)]"
            onClick={() => go((current) => current - 1)}
          >
            <Chevron dir="prev" />
          </button>
          {SLIDES.map((item, i) => (
            <button
              key={item.src}
              type="button"
              aria-label={`${item.caption}を表示`}
              aria-current={i === index ? "true" : undefined}
              className={cx(
                "h-2.5 w-2.5 rounded-full transition-colors duration-300",
                i === index ? "bg-brand-500" : "bg-[#cdd8da] hover:bg-brand-300",
              )}
              onClick={() => go(i)}
            />
          ))}
          <button
            type="button"
            aria-label="次の案内"
            className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#44545a] shadow-[0_1px_2px_rgba(16,40,46,0.06),0_8px_20px_rgba(16,40,46,0.08)] ring-1 ring-black/[0.06] transition hover:text-brand-700 hover:shadow-[0_4px_16px_rgba(16,40,46,0.12)]"
            onClick={() => go((current) => current + 1)}
          >
            <Chevron dir="next" />
          </button>
        </div>
      </div>
    </section>
  );
}
