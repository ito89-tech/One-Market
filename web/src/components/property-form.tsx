"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Field, FormStep, Select, TextInput } from "@/components/form";
import { StationSuggest } from "@/components/station-suggest";
import { Alert, Button } from "@/components/ui";
import {
  EMPTY_DRAFT,
  getDraftSnapshot,
  getServerDraftSnapshot,
  saveDraft,
  subscribeToDraft,
  type PropertyDraft,
} from "@/lib/draft";
import { uniquePreserveOrder } from "@/lib/station";
import { PREFECTURES } from "@/lib/validation";

type ApiFailure = {
  ok: false;
  error: { code: string; message: string; details?: Record<string, string> };
};
type ApiSuccess<T> = { ok: true; data: T };

type StationMatch = {
  name: string;
  sheetKey: string;
  sheetName: string;
  prefectures: string[];
};

type ResolvePayload = {
  ok: boolean;
  prefecture?: string;
  municipality?: string;
  kind?: string;
  message?: string;
  details?: Record<string, string>;
  candidates: StationMatch[];
};

export function PropertyForm({ isLoggedIn }: { isLoggedIn: boolean }) {
  const router = useRouter();

  const stored = useSyncExternalStore(
    subscribeToDraft,
    getDraftSnapshot,
    getServerDraftSnapshot,
  );
  const [edited, setEdited] = useState<PropertyDraft | null>(null);
  const draft = edited ?? stored ?? EMPTY_DRAFT;

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [stations, setStations] = useState<string[]>([]);
  const [stationStatus, setStationStatus] = useState<
    "idle" | "unique" | "ambiguous" | "unknown"
  >("idle");
  const [candidates, setCandidates] = useState<StationMatch[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/master/stations", { signal: controller.signal })
      .then((response) => response.json())
      .then((body: ApiSuccess<{ stations: string[] }> | ApiFailure) => {
        if (body.ok) setStations(uniquePreserveOrder(body.data.stations));
      })
      .catch(() => {
        /* Suggestions are optional; the field still accepts free text. */
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const station = draft.station.trim();
    if (!station) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        station,
        prefecture: draft.prefecture,
        municipality: draft.municipality,
      });
      fetch(`/api/master/station-resolve?${params}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((body: ApiSuccess<ResolvePayload> | ApiFailure) => {
          if (!body.ok) return;
          const data = body.data;
          setCandidates(data.candidates ?? []);
          if (data.ok && data.kind === "unique") setStationStatus("unique");
          else if ((data.candidates ?? []).length > 1) setStationStatus("ambiguous");
          else setStationStatus("unknown");
        })
        .catch(() => {
          /* Keep typing; submit still validates on the server. */
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [draft.station, draft.prefecture, draft.municipality]);

  function update<K extends keyof PropertyDraft>(key: K, value: string) {
    const next = { ...draft, [key]: value };
    setEdited(next);
    saveDraft(next);

    setErrors((current) => {
      if (!current[key]) return current;
      const nextErrors = { ...current };
      delete nextErrors[key];
      return nextErrors;
    });
  }

  function chooseCandidate(candidate: StationMatch) {
    const prefecture = candidate.prefectures[0] ?? "";
    update("prefecture", prefecture);
  }

  const stationStatusResolved = draft.station.trim() ? stationStatus : "idle";
  const needsLocationFallback =
    stationStatusResolved === "unknown" || stationStatusResolved === "ambiguous";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setErrors({});

    saveDraft(draft);

    try {
      const response = await fetch("/api/diagnosis/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = (await response.json()) as ApiSuccess<unknown> | ApiFailure;

      if (!body.ok) {
        if (body.error.details) setErrors(body.error.details);
        setFormError(body.error.message);
        setSubmitting(false);
        document
          .querySelector("[aria-invalid='true']")
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }

      router.push(isLoggedIn ? "/diagnosis/run" : "/signup?next=/diagnosis/run");
    } catch {
      setFormError("通信に失敗しました。時間をおいて再度お試しください。");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {formError ? <Alert tone="error">{formError}</Alert> : null}

      <FormStep
        step={1}
        title="最寄り駅"
        description="駅名からエリアを判定します。基準データにない駅や同名駅のときだけ、都道府県・市区町村の入力が必要です。"
      >
        <Field
          label="最寄り駅"
          required
          hint="駅名を入力すると候補が表示されます。「◯◯駅」と入力しても大丈夫です。"
          error={errors.station}
        >
          {(props) => (
            <StationSuggest
              {...props}
              name="station"
              value={draft.station}
              invalid={Boolean(errors.station)}
              stations={stations}
              placeholder="横浜"
              onChange={(value) => update("station", value)}
            />
          )}
        </Field>

        {stationStatusResolved === "unique" ? (
          <p className="rounded-xl bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-ink-700">
            この駅は基準データに登録されています。都道府県・市区町村の入力は不要です。
          </p>
        ) : null}

        {stationStatusResolved === "ambiguous" ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-700">
              同名の駅が複数の地域にあります。該当する地域を選んでください。
            </p>
            <div className="flex flex-col gap-2">
              {candidates.map((candidate) => (
                <button
                  key={`${candidate.sheetKey}:${candidate.name}`}
                  type="button"
                  className={`min-h-12 rounded-xl border px-4 py-3 text-left text-sm ${
                    candidate.prefectures.includes(draft.prefecture)
                      ? "border-brand-500 bg-brand-50 font-bold"
                      : "border-[var(--color-line)]"
                  }`}
                  onClick={() => chooseCandidate(candidate)}
                >
                  {candidate.name}（{candidate.sheetName}）
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {needsLocationFallback ? (
          <>
            <Field label="都道府県" required error={errors.prefecture}>
              {(props) => (
                <Select
                  {...props}
                  name="prefecture"
                  value={draft.prefecture}
                  invalid={Boolean(errors.prefecture)}
                  onChange={(event) => update("prefecture", event.target.value)}
                >
                  <option value="">選択してください</option>
                  {PREFECTURES.map((prefecture) => (
                    <option key={prefecture} value={prefecture}>
                      {prefecture}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            {stationStatusResolved === "unknown" ? (
              <Field
                label="市区町村"
                required
                hint="例：渋谷区、横浜市"
                error={errors.municipality}
              >
                {(props) => (
                  <TextInput
                    {...props}
                    name="municipality"
                    value={draft.municipality}
                    invalid={Boolean(errors.municipality)}
                    autoComplete="address-level2"
                    placeholder="渋谷区"
                    onChange={(event) =>
                      update("municipality", event.target.value)
                    }
                  />
                )}
              </Field>
            ) : null}
          </>
        ) : null}
      </FormStep>

      <FormStep step={2} title="建物のこと">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="駅徒歩" required suffix="分" error={errors.walkMinutes}>
            {(props) => (
              <TextInput
                {...props}
                name="walkMinutes"
                inputMode="numeric"
                hasSuffix
                value={draft.walkMinutes}
                invalid={Boolean(errors.walkMinutes)}
                placeholder="7"
                onChange={(event) => update("walkMinutes", event.target.value)}
              />
            )}
          </Field>

          <Field label="築年数" required suffix="年" error={errors.buildingAge}>
            {(props) => (
              <TextInput
                {...props}
                name="buildingAge"
                inputMode="numeric"
                hasSuffix
                value={draft.buildingAge}
                invalid={Boolean(errors.buildingAge)}
                placeholder="7"
                onChange={(event) => update("buildingAge", event.target.value)}
              />
            )}
          </Field>
        </div>

        <Field
          label="物件価格"
          required
          suffix="万円"
          hint="例：2,670万円の物件なら「2670」と入力します"
          error={errors.priceMan}
        >
          {(props) => (
            <TextInput
              {...props}
              name="priceMan"
              inputMode="numeric"
              hasSuffix
              value={draft.priceMan}
              invalid={Boolean(errors.priceMan)}
              placeholder="2670"
              onChange={(event) => update("priceMan", event.target.value)}
            />
          )}
        </Field>
      </FormStep>

      <FormStep
        step={3}
        title="毎月の収支"
        description="物件資料に記載されている月あたりの金額を、円単位で入力してください。"
      >
        <Field
          label="月額賃料"
          required
          suffix="円"
          hint="毎月の家賃収入です"
          error={errors.monthlyRentYen}
        >
          {(props) => (
            <TextInput
              {...props}
              name="monthlyRentYen"
              inputMode="numeric"
              hasSuffix
              value={draft.monthlyRentYen}
              invalid={Boolean(errors.monthlyRentYen)}
              placeholder="90000"
              onChange={(event) => update("monthlyRentYen", event.target.value)}
            />
          )}
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="管理費"
            required
            suffix="円"
            hint="かからない場合は 0"
            error={errors.managementFeeYen}
          >
            {(props) => (
              <TextInput
                {...props}
                name="managementFeeYen"
                inputMode="numeric"
                hasSuffix
                value={draft.managementFeeYen}
                invalid={Boolean(errors.managementFeeYen)}
                placeholder="7820"
                onChange={(event) =>
                  update("managementFeeYen", event.target.value)
                }
              />
            )}
          </Field>

          <Field
            label="修繕積立金"
            required
            suffix="円"
            hint="かからない場合は 0"
            error={errors.repairReserveYen}
          >
            {(props) => (
              <TextInput
                {...props}
                name="repairReserveYen"
                inputMode="numeric"
                hasSuffix
                value={draft.repairReserveYen}
                invalid={Boolean(errors.repairReserveYen)}
                placeholder="4260"
                onChange={(event) =>
                  update("repairReserveYen", event.target.value)
                }
              />
            )}
          </Field>
        </div>
      </FormStep>

      <div className="sticky bottom-0 z-20 border-t border-[var(--color-line)] bg-white/95 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:py-0 sm:pb-0 sm:backdrop-blur-none">
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "確認しています…" : "この物件の相場を確認してみる"}
        </Button>
        {!isLoggedIn ? (
          <p className="mt-3 text-center text-xs text-ink-500">
            次の画面で会員登録します。入力した内容はそのまま引き継がれます。
          </p>
        ) : null}
      </div>
    </form>
  );
}
