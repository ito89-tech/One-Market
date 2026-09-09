import type { Judgement } from "./engine";

export const JUDGEMENT_LABEL: Record<Judgement, string> = {
  UNDERPRICED: "割安",
  FAIR: "相場通り",
  OVERPRICED: "割高",
};

export const JUDGEMENT_HEADLINE: Record<Judgement, string> = {
  UNDERPRICED: "この物件は相場より安めです",
  FAIR: "この物件は相場どおりの価格です",
  OVERPRICED: "この物件は相場より高めです",
};

export const JUDGEMENT_SUMMARY: Record<Judgement, string> = {
  UNDERPRICED:
    "同じエリア・築年数の水準と比べると、提示価格は相場の範囲を下回っています。",
  FAIR: "同じエリア・築年数の水準と比べると、提示価格は相場の範囲に収まっています。",
  OVERPRICED:
    "同じエリア・築年数の水準と比べると、提示価格は相場の範囲を上回っています。",
};

export function formatMan(value: number): string {
  return `${value.toLocaleString("ja-JP")}万円`;
}

export function formatManRange(low: number, high: number): string {
  if (low === high) return formatMan(low);
  return `${low.toLocaleString("ja-JP")}万円〜${high.toLocaleString("ja-JP")}万円`;
}

export function formatYen(value: number | bigint): string {
  return `${Number(value).toLocaleString("ja-JP")}円`;
}

export function formatDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Difference wording. Rounding can collapse a small gap to zero, in which case
 * we say nothing rather than print "0万円高い".
 */
export function describeDifference(
  judgement: Judgement,
  lowMan: number,
  highMan: number,
): string | null {
  if (judgement === "FAIR") return null;
  if (highMan <= 0) return null;

  const direction = judgement === "OVERPRICED" ? "高い" : "安い";
  const amount =
    lowMan === highMan || lowMan <= 0
      ? formatMan(highMan)
      : `${lowMan.toLocaleString("ja-JP")}万円〜${highMan.toLocaleString("ja-JP")}万円`;
  return `相場より ${amount} ほど${direction}価格です`;
}
