import { describe, expect, it } from "vitest";

import {
  JUDGEMENT_HEADLINE,
  JUDGEMENT_LABEL,
  describeDifference,
  formatMan,
  formatManRange,
  formatYen,
} from "@/lib/format";
import { safeNext } from "@/lib/next-param";

describe("表示フォーマット", () => {
  it("万円・円を3桁区切りで表示する", () => {
    expect(formatMan(2670)).toBe("2,670万円");
    expect(formatYen(935_040)).toBe("935,040円");
  });

  it("価格帯を範囲で表示し、上下が同じときは1つにまとめる", () => {
    expect(formatManRange(2400, 2500)).toBe("2,400万円〜2,500万円");
    expect(formatManRange(2400, 2400)).toBe("2,400万円");
  });

  it("判定ラベルは割安・相場通り・割高の3段階", () => {
    expect(JUDGEMENT_LABEL.UNDERPRICED).toBe("割安");
    expect(JUDGEMENT_LABEL.FAIR).toBe("相場通り");
    expect(JUDGEMENT_LABEL.OVERPRICED).toBe("割高");
  });

  it("見出しに利回りなどの内部指標を含めない", () => {
    for (const headline of Object.values(JUDGEMENT_HEADLINE)) {
      expect(headline).not.toMatch(/利回り|収益率|%/);
    }
  });
});

describe("価格差の文言", () => {
  it("割高なら「高い」、割安なら「安い」と表現する", () => {
    expect(describeDifference("OVERPRICED", 170, 270)).toBe(
      "相場より 170万円〜270万円 ほど高い価格です",
    );
    expect(describeDifference("UNDERPRICED", 50, 120)).toBe(
      "相場より 50万円〜120万円 ほど安い価格です",
    );
  });

  it("相場通りのときは差額を語らない", () => {
    expect(describeDifference("FAIR", 0, 0)).toBeNull();
  });

  it("丸めで差が消えたときは「0万円高い」と言わない", () => {
    expect(describeDifference("OVERPRICED", 0, 0)).toBeNull();
  });

  it("下限が0のときは上限だけを示す", () => {
    expect(describeDifference("OVERPRICED", 0, 80)).toBe(
      "相場より 80万円 ほど高い価格です",
    );
  });
});

describe("ログイン後の遷移先", () => {
  it("同一サイトの絶対パスだけを許可する", () => {
    expect(safeNext("/diagnosis/run")).toBe("/diagnosis/run");
  });

  it("外部サイトへの誘導を拒否する", () => {
    expect(safeNext("https://evil.example.com")).toBe("/mypage");
    expect(safeNext("//evil.example.com")).toBe("/mypage");
    expect(safeNext("/\\evil.example.com")).toBe("/mypage");
    expect(safeNext("javascript:alert(1)")).toBe("/mypage");
  });

  it("未指定なら既定の遷移先を返す", () => {
    expect(safeNext(undefined)).toBe("/mypage");
    expect(safeNext("", "/login")).toBe("/login");
  });
});
