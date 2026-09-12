"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Card } from "@/components/ui";

type RateRow = {
  id: string;
  sheetName: string;
  areaCode: string;
  ageLabel: string;
  lowPercent: number;
  highPercent: number;
  isValid: boolean;
  raw: string;
};

export function YieldRateEditor({ initialRows }: { initialRows: RateRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const visible = rows.filter((row) => {
    if (!filter.trim()) return true;
    const needle = filter.trim();
    return (
      row.sheetName.includes(needle) ||
      row.areaCode.includes(needle) ||
      row.ageLabel.includes(needle) ||
      row.raw.includes(needle)
    );
  });

  async function save(row: RateRow) {
    setPendingId(row.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/yield-rates/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lowPercent: row.lowPercent,
          highPercent: row.highPercent,
          isValid: row.isValid,
          raw: row.raw,
        }),
      });
      const body = (await response.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!body.ok) throw new Error(body.error.message);
      setMessage("収益率セルを保存しました");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存に失敗しました");
    } finally {
      setPendingId(null);
    }
  }

  function update(id: string, patch: Partial<RateRow>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink-900">収益率セルの修正</h2>
          <p className="mt-1 text-sm text-ink-500">
            PostgreSQL 上の値を直接編集します。保存直後から診断計算に反映されます。
          </p>
        </div>
        <label className="text-sm text-ink-700">
          絞り込み
          <input
            className="ml-2 rounded-lg border border-[var(--color-line)] px-3 py-1.5"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="シート / エリア / 築年"
          />
        </label>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--color-line)] text-ink-500">
            <tr>
              <th className="px-2 py-2 font-medium">シート</th>
              <th className="px-2 py-2 font-medium">エリア</th>
              <th className="px-2 py-2 font-medium">築年</th>
              <th className="px-2 py-2 font-medium">下限%</th>
              <th className="px-2 py-2 font-medium">上限%</th>
              <th className="px-2 py-2 font-medium">表記</th>
              <th className="px-2 py-2 font-medium">有効</th>
              <th className="px-2 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, 200).map((row) => (
              <tr key={row.id} className="border-b border-[var(--color-line)]">
                <td className="px-2 py-2">{row.sheetName}</td>
                <td className="px-2 py-2">{row.areaCode}</td>
                <td className="px-2 py-2">{row.ageLabel}</td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    step="0.01"
                    className="w-20 rounded border border-[var(--color-line)] px-2 py-1"
                    value={row.lowPercent}
                    onChange={(event) =>
                      update(row.id, {
                        lowPercent: Number(event.target.value),
                      })
                    }
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    step="0.01"
                    className="w-20 rounded border border-[var(--color-line)] px-2 py-1"
                    value={row.highPercent}
                    onChange={(event) =>
                      update(row.id, {
                        highPercent: Number(event.target.value),
                      })
                    }
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    className="w-36 rounded border border-[var(--color-line)] px-2 py-1"
                    value={row.raw}
                    onChange={(event) =>
                      update(row.id, { raw: event.target.value })
                    }
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={row.isValid}
                    onChange={(event) =>
                      update(row.id, { isValid: event.target.checked })
                    }
                  />
                </td>
                <td className="px-2 py-2">
                  <Button
                    type="button"
                    variant="quiet"
                    disabled={pendingId === row.id}
                    onClick={() => void save(row)}
                  >
                    {pendingId === row.id ? "…" : "保存"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length > 200 ? (
          <p className="mt-2 text-xs text-ink-300">
            先頭 200 件のみ表示しています。絞り込みで対象を狭めてください。
          </p>
        ) : null}
      </div>
    </Card>
  );
}
