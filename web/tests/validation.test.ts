import { describe, expect, it } from "vitest";

import {
  adminCreateUserSchema,
  loginSchema,
  propertyInputSchema,
  registerSchema,
  toFieldErrors,
} from "@/lib/validation";

const VALID = {
  prefecture: "神奈川県",
  municipality: "横浜市西区",
  station: "横浜",
  priceMan: "2670",
  buildingAge: "7",
  walkMinutes: "5",
  monthlyRentYen: "90000",
  managementFeeYen: "7820",
  repairReserveYen: "4260",
};

function parse(overrides: Partial<Record<keyof typeof VALID, unknown>> = {}) {
  return propertyInputSchema.safeParse({ ...VALID, ...overrides });
}

function messageFor(
  overrides: Partial<Record<keyof typeof VALID, unknown>>,
  field: string,
) {
  const result = parse(overrides);
  expect(result.success).toBe(false);
  if (result.success) throw new Error("unreachable");
  return toFieldErrors(result.error)[field];
}

describe("物件入力バリデーション", () => {
  it("正常な入力を数値へ変換して受け付ける", () => {
    const result = parse();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.priceMan).toBe(2670);
    expect(result.data.monthlyRentYen).toBe(90_000);
    expect(result.data.walkMinutes).toBe(5);
  });

  it("全角数字・カンマ・空白を含む入力を受け付ける", () => {
    const result = parse({
      priceMan: "２，６７０",
      monthlyRentYen: " 90,000 ",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.priceMan).toBe(2670);
    expect(result.data.monthlyRentYen).toBe(90_000);
  });

  it("管理費・修繕積立金の0円を許容する", () => {
    const result = parse({ managementFeeYen: "0", repairReserveYen: "0" });
    expect(result.success).toBe(true);
  });

  it("築0年（新築）と駅徒歩0分を許容する", () => {
    const result = parse({ buildingAge: "0", walkMinutes: "0" });
    expect(result.success).toBe(true);
  });

  describe("異常系", () => {
    it("空欄を拒否する", () => {
      expect(messageFor({ priceMan: "" }, "priceMan")).toContain("入力してください");
    });

    it("文字列を拒否する", () => {
      expect(messageFor({ priceMan: "たかい" }, "priceMan")).toContain("半角数字");
    });

    it("マイナス値を拒否する", () => {
      expect(messageFor({ priceMan: "-100" }, "priceMan")).toContain("以上");
      expect(messageFor({ managementFeeYen: "-1" }, "managementFeeYen")).toContain(
        "以上",
      );
    });

    it("物件価格0を拒否する", () => {
      expect(messageFor({ priceMan: "0" }, "priceMan")).toContain("以上");
    });

    it("異常に大きい値を拒否する", () => {
      expect(messageFor({ priceMan: "999999999" }, "priceMan")).toContain("以下");
      expect(messageFor({ monthlyRentYen: "99999999999" }, "monthlyRentYen")).toContain(
        "以下",
      );
    });

    it("小数を拒否する", () => {
      expect(messageFor({ buildingAge: "7.5" }, "buildingAge")).toContain("整数");
    });

    it("不正な駅徒歩分数を拒否する", () => {
      expect(messageFor({ walkMinutes: "-3" }, "walkMinutes")).toContain("以上");
      expect(messageFor({ walkMinutes: "999" }, "walkMinutes")).toContain("以下");
      expect(messageFor({ walkMinutes: "５分" }, "walkMinutes")).toContain("半角数字");
    });

    it("築年数の上限を超える値を拒否する", () => {
      expect(messageFor({ buildingAge: "300" }, "buildingAge")).toContain("以下");
    });

    it("未知の都道府県は拒否し、空欄はスキーマ上許可する（駅で一意なら不要）", () => {
      expect(parse({ prefecture: "" }).success).toBe(true);
      expect(messageFor({ prefecture: "カリフォルニア州" }, "prefecture")).toBeTruthy();
    });

    it("駅名の空欄と長すぎる値を拒否する", () => {
      expect(messageFor({ station: "   " }, "station")).toContain("入力してください");
      expect(messageFor({ station: "あ".repeat(31) }, "station")).toContain("30文字");
    });

    it("実質収入が0円以下になる組み合わせを拒否する", () => {
      const message = messageFor(
        { monthlyRentYen: "10000", managementFeeYen: "6000", repairReserveYen: "4000" },
        "monthlyRentYen",
      );
      expect(message).toContain("実質収入");
    });
  });
});

describe("会員登録バリデーション", () => {
  it("正常な入力を受け付ける", () => {
    const result = registerSchema.safeParse({
      email: " Owner@Example.com ",
      password: "password123",
      displayName: "山田",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.email).toBe("Owner@Example.com");
  });

  it("表示名は任意", () => {
    expect(
      registerSchema.safeParse({ email: "a@example.com", password: "password123" })
        .success,
    ).toBe(true);
  });

  it("メール形式と8文字未満のパスワードを拒否する", () => {
    const bad = registerSchema.safeParse({ email: "not-an-email", password: "short" });
    expect(bad.success).toBe(false);
    if (bad.success) return;
    const errors = toFieldErrors(bad.error);
    expect(errors.email).toContain("形式");
    expect(errors.password).toContain("8文字以上");
  });
});

describe("ログインバリデーション", () => {
  it("空欄を拒否する", () => {
    const result = loginSchema.safeParse({ email: "", password: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = toFieldErrors(result.error);
    expect(errors.email).toBeTruthy();
    expect(errors.password).toBeTruthy();
  });
});

describe("管理者のユーザー作成バリデーション", () => {
  it("権限を受け取れる", () => {
    const result = adminCreateUserSchema.safeParse({
      email: "a@example.com",
      password: "password123",
      role: "ADMIN",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.role).toBe("ADMIN");
  });
});
