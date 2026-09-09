import { expect, type Page } from "@playwright/test";

/** クライアント提供の計算例と同じ物件（横浜駅・築7年・2,670万円） */
export const SAMPLE_PROPERTY = {
  prefecture: "神奈川県",
  municipality: "横浜市西区",
  station: "横浜駅",
  walkMinutes: "5",
  buildingAge: "7",
  priceMan: "2670",
  monthlyRentYen: "90000",
  managementFeeYen: "7820",
  repairReserveYen: "4260",
};

export type PropertyValues = typeof SAMPLE_PROPERTY;

let counter = 0;

export function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@example.test`;
}

export const PASSWORD = "onemake-e2e-pass";

export async function fillPropertyForm(
  page: Page,
  values: Partial<PropertyValues> = {},
) {
  const v = { ...SAMPLE_PROPERTY, ...values };
  await page.getByLabel("最寄り駅").fill(v.station);

  await Promise.race([
    page.getByText("都道府県・市区町村の入力は不要です").waitFor({ timeout: 8000 }),
    page.getByLabel("都道府県").waitFor({ state: "visible", timeout: 8000 }),
  ]).catch(() => {
    /* Lookup is best-effort; submit still validates on the server. */
  });

  if (await page.getByLabel("都道府県").isVisible()) {
    await page.getByLabel("都道府県").selectOption(v.prefecture);
    if (await page.getByLabel("市区町村").isVisible()) {
      await page.getByLabel("市区町村").fill(v.municipality);
    }
  }

  await page.getByLabel("駅徒歩").fill(v.walkMinutes);
  await page.getByLabel("築年数").fill(v.buildingAge);
  await page.getByLabel("物件価格").fill(v.priceMan);
  await page.getByLabel("月額賃料").fill(v.monthlyRentYen);
  await page.getByLabel("管理費").fill(v.managementFeeYen);
  await page.getByLabel("修繕積立金").fill(v.repairReserveYen);
}

export function submitProperty(page: Page) {
  return page.getByRole("button", { name: "この物件の相場を確認してみる" }).click();
}

/**
 * 診断結果ページに着いたかどうか。`?next=/diagnosis/run` のようなクエリ付き
 * URL に引っかからないよう、パス部分だけで判定する。
 */
export function isResultUrl(url: URL): boolean {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2 || segments[0] !== "diagnosis") return false;
  return segments[1] !== "new" && segments[1] !== "run";
}

export function waitForResult(page: Page) {
  return page.waitForURL(isResultUrl, { timeout: 30_000 });
}

export async function register(page: Page, email: string) {
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(PASSWORD);
  await page.getByRole("button", { name: "登録して診断結果を見る" }).click();
}

/** 新規登録から初回（無料）診断まで通し、診断結果 URL を返す。 */
export async function signUpAndDiagnose(
  page: Page,
  email: string,
  values: Partial<PropertyValues> = {},
): Promise<string> {
  await page.goto("/diagnosis/new");
  await fillPropertyForm(page, values);
  await submitProperty(page);

  await expect(page).toHaveURL(/\/signup/);
  await register(page, email);

  await waitForResult(page);
  return page.url();
}

export async function logout(page: Page) {
  await page.goto("/mypage");
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/$/);
}

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/mypage/);
}

/** スマートフォンで横スクロールが発生していないこと。 */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

/** React の重複キー警告だけを拾う。拡張機能由来の console error は無視する。 */
export function watchDuplicateKeyErrors(page: Page): string[] {
  const messages: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (
      text.includes("Encountered two children with the same key") ||
      text.includes("Each child in a list should have a unique")
    ) {
      messages.push(text);
    }
  });
  return messages;
}
