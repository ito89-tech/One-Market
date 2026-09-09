/**
 * Shared input schemas. The browser uses them for instant feedback and the
 * route handlers re-run the exact same rules, so a crafted request cannot
 * bypass validation.
 */
import { z } from "zod";

export const PREFECTURES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
] as const;

/**
 * Accepts what people actually type into a number field (full-width digits,
 * thousands separators) and rejects anything else outright rather than letting
 * Number() silently coerce it.
 */
function numericField(label: string) {
  return z
    .union([z.string(), z.number()])
    .transform((value, ctx) => {
      if (typeof value === "number") return value;
      const normalised = value
        .normalize("NFKC")
        .replace(/[,\s]/g, "")
        .trim();
      if (normalised === "") {
        ctx.addIssue({ code: "custom", message: `${label}を入力してください` });
        return z.NEVER;
      }
      if (!/^-?\d+(\.\d+)?$/.test(normalised)) {
        ctx.addIssue({
          code: "custom",
          message: `${label}は半角数字で入力してください`,
        });
        return z.NEVER;
      }
      return Number(normalised);
    })
    .pipe(
      z.number({ message: `${label}は数値で入力してください` }).finite({
        message: `${label}の値をご確認ください`,
      }),
    );
}

function integerField(label: string, min: number, max: number) {
  return numericField(label)
    .refine((value) => Number.isInteger(value), {
      message: `${label}は整数で入力してください`,
    })
    .refine((value) => value >= min, {
      message: `${label}は${min.toLocaleString("ja-JP")}以上で入力してください`,
    })
    .refine((value) => value <= max, {
      message: `${label}は${max.toLocaleString("ja-JP")}以下で入力してください`,
    });
}

export const propertyInputSchema = z
  .object({
    prefecture: z
      .string()
      .trim()
      .max(20, "都道府県は20文字以内で入力してください")
      .refine(
        (value) =>
          value === "" || (PREFECTURES as readonly string[]).includes(value),
        "都道府県を選択してください",
      ),
    municipality: z
      .string()
      .trim()
      .max(30, "市区町村は30文字以内で入力してください"),
    station: z
      .string()
      .trim()
      .min(1, "最寄り駅を入力してください")
      .max(30, "最寄り駅は30文字以内で入力してください"),
    // 物件価格は「万円」で入力してもらう（不動産の一般的な表記に合わせる）
    priceMan: integerField("物件価格", 1, 100_000),
    buildingAge: integerField("築年数", 0, 120),
    walkMinutes: integerField("駅徒歩分数", 0, 120),
    monthlyRentYen: integerField("月額賃料", 1, 10_000_000),
    managementFeeYen: integerField("管理費", 0, 1_000_000),
    repairReserveYen: integerField("修繕積立金", 0, 1_000_000),
  })
  .refine(
    (value) =>
      value.monthlyRentYen - value.managementFeeYen - value.repairReserveYen > 0,
    {
      path: ["monthlyRentYen"],
      message:
        "管理費と修繕積立金の合計が月額賃料以上のため、実質収入が0円以下になります。金額をご確認ください。",
    },
  );

export type PropertyInput = z.infer<typeof propertyInputSchema>;

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "メールアドレスを入力してください")
    .max(254, "メールアドレスが長すぎます")
    .email("メールアドレスの形式が正しくありません"),
  password: z
    .string()
    .min(8, "パスワードは8文字以上で入力してください")
    .max(128, "パスワードは128文字以内で入力してください"),
  displayName: z
    .string()
    .trim()
    .max(50, "お名前は50文字以内で入力してください")
    .optional()
    .or(z.literal("")),
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, "メールアドレスを入力してください"),
  password: z.string().min(1, "パスワードを入力してください"),
});

/** Turns a ZodError into the flat `{ field: message }` shape the API returns. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const details: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!details[key]) details[key] = issue.message;
  }
  return details;
}
