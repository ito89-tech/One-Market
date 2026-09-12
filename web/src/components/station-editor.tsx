"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Card } from "@/components/ui";

type AreaOption = { id: string; code: string; label: string };
type SheetOption = {
  id: string;
  name: string;
  areas: AreaOption[];
};

type StationRow = {
  id: string;
  name: string;
  lookupKey: string;
  sheetId: string;
  sheetName: string;
  areaId: string;
  areaCode: string;
};

export function StationEditor({
  sheets,
  initialStations,
}: {
  sheets: SheetOption[];
  initialStations: StationRow[];
}) {
  const router = useRouter();
  const [stations, setStations] = useState(initialStations);
  const [sheetId, setSheetId] = useState(sheets[0]?.id ?? "");
  const [areaId, setAreaId] = useState(sheets[0]?.areas[0]?.id ?? "");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const areas = sheets.find((sheet) => sheet.id === sheetId)?.areas ?? [];

  async function addStation() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/stations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sheetId, areaId, name }),
      });
      const body = (await response.json()) as
        | { ok: true; data: { id: string; name: string; lookupKey: string } }
        | { ok: false; error: { message: string } };
      if (!body.ok) throw new Error(body.error.message);
      setMessage(`駅「${body.data.name}」を追加しました`);
      setName("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "追加に失敗しました");
    } finally {
      setPending(false);
    }
  }

  async function removeStation(id: string) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/stations/${id}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as
        | { ok: true }
        | { ok: false; error: { message: string } };
      if (!body.ok) throw new Error(body.error.message);
      setStations((current) => current.filter((row) => row.id !== id));
      setMessage("駅を削除しました");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "削除に失敗しました");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-ink-900">駅マスタの補充・削除</h2>
        <p className="mt-1 text-sm text-ink-500">
          xlsx 取込後の不足分を、管理者が PostgreSQL 上で直接補充できます。
        </p>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm">
          シート
          <select
            className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-3 py-2"
            value={sheetId}
            onChange={(event) => {
              const nextSheet = event.target.value;
              setSheetId(nextSheet);
              const nextAreas =
                sheets.find((sheet) => sheet.id === nextSheet)?.areas ?? [];
              setAreaId(nextAreas[0]?.id ?? "");
            }}
          >
            {sheets.map((sheet) => (
              <option key={sheet.id} value={sheet.id}>
                {sheet.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          エリア
          <select
            className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-3 py-2"
            value={areaId}
            onChange={(event) => setAreaId(event.target.value)}
          >
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.label}（{area.code}）
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          駅名
          <input
            className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-3 py-2"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例: 渋谷"
          />
        </label>
      </div>
      <Button type="button" disabled={pending || !name.trim()} onClick={() => void addStation()}>
        {pending ? "処理中…" : "駅を追加"}
      </Button>

      <div className="max-h-80 overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-white text-ink-500">
            <tr>
              <th className="px-2 py-2 font-medium">シート</th>
              <th className="px-2 py-2 font-medium">エリア</th>
              <th className="px-2 py-2 font-medium">駅名</th>
              <th className="px-2 py-2 font-medium">照合キー</th>
              <th className="px-2 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {stations.slice(0, 300).map((row) => (
              <tr key={row.id} className="border-t border-[var(--color-line)]">
                <td className="px-2 py-2">{row.sheetName}</td>
                <td className="px-2 py-2">{row.areaCode}</td>
                <td className="px-2 py-2">{row.name}</td>
                <td className="px-2 py-2">{row.lookupKey}</td>
                <td className="px-2 py-2">
                  <Button
                    type="button"
                    variant="quiet"
                    disabled={pending}
                    onClick={() => void removeStation(row.id)}
                  >
                    削除
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
