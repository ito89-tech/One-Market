"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";

import { cx } from "@/components/ui";

/**
 * スクロールで要素をふわっと出す。
 *
 * 初期状態は「表示」。JavaScript が動かない場合やサーバー描画でも中身が読める
 * ようにするため。隠してから出す制御は IntersectionObserver と DOM クラスで
 * 行い、React の state は持たない（state にすると mount 直後に必ず再描画が
 * 走る割に、描画結果はクラス1つの差でしかない）。
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "li";
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const alreadyInView =
      node.getBoundingClientRect().top < window.innerHeight * 0.92;
    if (alreadyInView) return;

    // 隠すときは遅延させない。遅延は「出るとき」だけに効かせる。
    node.style.transitionDelay = "0ms";
    node.classList.remove("is-visible");

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        node.style.transitionDelay = `${delay}ms`;
        node.classList.add("is-visible");
        observer.disconnect();
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [delay]);

  const Component = Tag as ElementType;

  return (
    <Component
      ref={ref}
      className={cx("reveal", "is-visible", className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Component>
  );
}
