"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Card } from "@/components/ui";

type Stats = {
  sheets: number;
  areas: number;
  stations: number;
  municipalities: number;
  ageBrackets: number;
  yieldRates: number;
  issues: number;
  source: string | null;
  generatedAt: string | null;
};

type SyncResult = {
  message: string;
  stats: Stats;
  source?: string;
};

export function YieldMasterSyncPanel({ initialStats }: { initialStats: Stats }) {
  const router = useRouter();
  const [pending, setPending] = useState<"sync" | "upload" | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const stats = result?.stats ?? initialStats;

  async function runSync() {
    setPending("sync");
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/admin/yield-master/sync", {
        method: "POST",
      });
      const body = (await response.json()) as
        | { ok: true; data: SyncResult }
        | { ok: false; error: { message: string } };
      if (!body.ok) throw new Error(body.error.message);
      setResult(body.data);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "同期に失敗しました。時間をおいて再度お試しください。",
      );
    } finally {
      setPending(null);
    }
  }

  async function runUpload() {
    if (!file) {
      setError("xlsx ファイルを選択してください");
      return;
    }
    setPending("upload");
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/admin/yield-master/upload", {
        method: "POST",
        body: form,
      });
      const body = (await response.json()) as
        | { ok: true; data: SyncResult }
        | { ok: false; error: { message: string } };
      if (!body.ok) throw new Error(body.error.message);
      setResult(body.data);
      setFile(null);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "アップロードに失敗しました。時間をおいて再度お試しください。",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-ink-900">xlsx → PostgreSQL 同期</h2>
        <p className="mt-1 text-sm text-ink-500">
          利回りシート.xlsx を解析し、Prisma スキーマどおりに Neon / PostgreSQL
          へ直接書き込みます。JSON 中間ファイルは使いません。会員・決済・診断履歴は消しません。
        </p>
      </div>

      <dl className="grid gap-2 text-sm text-ink-700 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-ink-300">シート</dt>
          <dd className="font-bold text-ink-900">{stats.sheets}</dd>
        </div>
        <div>
          <dt className="text-ink-300">駅 / 市区町村</dt>
          <dd className="font-bold text-ink-900">
            {stats.stations} / {stats.municipalities}
          </dd>
        </div>
        <div>
          <dt className="text-ink-300">収益率セル</dt>
          <dd className="font-bold text-ink-900">{stats.yieldRates}</dd>
        </div>
        <div>
          <dt className="text-ink-300">検証 issues</dt>
          <dd className="font-bold text-ink-900">{stats.issues}</dd>
        </div>
      </dl>
      {stats.source || stats.generatedAt ? (
        <p className="text-xs text-ink-300">
          ソース: {stats.source ?? "—"}
          {stats.generatedAt ? ` / 取込: ${stats.generatedAt}` : ""}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => void runSync()}
          disabled={pending !== null}
        >
          {pending === "sync"
            ? "反映中…"
            : "バンドル済み xlsx を PostgreSQL に再反映"}
        </Button>
      </div>

      <div className="border-t border-[var(--color-line)] pt-4">
        <label className="block text-sm font-bold text-ink-900" htmlFor="yield-xlsx-file">
          新しい利回りシート.xlsx をアップロード
        </label>
        <input
          id="yield-xlsx-file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="mt-2 block w-full text-sm text-ink-700 file:mr-3 file:rounded-full file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:font-bold file:text-brand-700"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError(null);
          }}
        />
        <div className="mt-3">
          <Button
            type="button"
            variant="quiet"
            onClick={() => void runUpload()}
            disabled={pending !== null || !file}
          >
            {pending === "upload" ? "取り込み中…" : "xlsx を解析して DB に反映"}
          </Button>
        </div>
      </div>

      {error ? (
        <Alert tone="error" title="同期エラー">
          {error}
        </Alert>
      ) : null}
      {result ? (
        <Alert tone="success" title="同期完了">
          {result.message}
          （シート {result.stats.sheets} / 駅 {result.stats.stations} / セル{" "}
          {result.stats.yieldRates}）
        </Alert>
      ) : null}
    </Card>
  );
}
