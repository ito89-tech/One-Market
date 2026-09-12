"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-xl font-bold text-ink-900">
        一時的なエラーが発生しました
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-500">
        時間をおいて再度お試しください。改善しない場合は、しばらく待ってからアクセスしてください。
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-bold text-white"
      >
        再読み込み
      </button>
    </div>
  );
}
