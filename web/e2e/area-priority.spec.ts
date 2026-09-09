import { expect, test } from "@playwright/test";

import { signUpAndDiagnose, uniqueEmail } from "./helpers";

/**
 * エリア判定は「駅名 → 市区町村」の順で行う。
 *
 * 画面に内部のエリア区分は出さないため、表示される相場価格の帯で確認する。
 * 同じ収支・築年数のまま最寄り駅だけを変えると、駅で一致した場合と
 * 市区町村で一致した場合とで相場価格がはっきり変わる。
 */
const CASES = [
  {
    name: "横浜駅は「横浜市」ではなく駅の区分で判定される",
    station: "横浜駅",
    municipality: "横浜市",
    expected: "2,758万円〜2,922万円",
  },
  {
    name: "登録のない駅名なら「横浜市」の区分にさがる",
    station: "架空ヶ丘",
    municipality: "横浜市",
    expected: "2,467万円〜2,527万円",
  },
  {
    name: "武蔵小杉駅は「川崎市」ではなく駅の区分で判定される",
    station: "武蔵小杉駅",
    municipality: "川崎市",
    expected: "2,718万円〜2,791万円",
  },
  {
    name: "登録のない駅名なら「川崎市」の区分にさがる",
    station: "架空ヶ丘",
    municipality: "川崎市",
    expected: "2,467万円〜2,527万円",
  },
];

test.describe("エリア判定の優先順位", () => {
  for (const testCase of CASES) {
    test(testCase.name, async ({ page }) => {
      await signUpAndDiagnose(page, uniqueEmail("area"), {
        station: testCase.station,
        municipality: testCase.municipality,
      });

      await expect(page.getByText(testCase.expected)).toBeVisible();
    });
  }

  test("駅名の「駅」の有無で結果が変わらない", async ({ page }) => {
    await signUpAndDiagnose(page, uniqueEmail("suffix-a"), { station: "横浜" });
    const withoutSuffix = await page.getByText(/万円〜.*万円/).first().innerText();

    const other = await page.context().browser()!.newContext();
    const otherPage = await other.newPage();
    await signUpAndDiagnose(otherPage, uniqueEmail("suffix-b"), { station: "横浜駅" });
    const withSuffix = await otherPage.getByText(/万円〜.*万円/).first().innerText();
    await other.close();

    expect(withSuffix).toBe(withoutSuffix);
  });

  test("「横浜」と「横浜市」は別のものとして扱われる", async ({ page }) => {
    await signUpAndDiagnose(page, uniqueEmail("distinct-a"), {
      station: "横浜",
      municipality: "横浜市",
    });
    await expect(page.getByText("2,758万円〜2,922万円")).toBeVisible();

    const other = await page.context().browser()!.newContext();
    const otherPage = await other.newPage();
    await signUpAndDiagnose(otherPage, uniqueEmail("distinct-b"), {
      station: "横浜市",
      municipality: "横浜市",
    });
    // 駅名として「横浜市」は一致せず、市区町村側の区分になる
    await expect(otherPage.getByText("2,467万円〜2,527万円")).toBeVisible();
    await other.close();
  });
});

/**
 * 3.19% / 3.20% / 3.39% / 3.40% の境界。
 *
 * 横浜駅・築7年の基準は 3.20%〜3.39%。年間実質収入を 935,040 円（月額賃料
 * 90,000 −管理費 7,820 −修繕積立金 4,260 の12か月分）に固定したまま物件価格
 * だけを動かし、収益率が各境界に載るようにしている。
 */
const BOUNDARIES = [
  { priceMan: "2931", percent: "3.19", label: "割高" },
  { priceMan: "2922", percent: "3.20", label: "相場通り" },
  { priceMan: "2758", percent: "3.39", label: "相場通り" },
  { priceMan: "2751", percent: "3.40", label: "割安" },
];

test.describe("判定の境界値", () => {
  for (const boundary of BOUNDARIES) {
    test(`${boundary.percent}% 相当（${boundary.priceMan}万円）は「${boundary.label}」`, async ({
      page,
    }) => {
      await signUpAndDiagnose(page, uniqueEmail("boundary"), {
        priceMan: boundary.priceMan,
      });

      await expect(page.getByText(`判定：${boundary.label}`)).toBeVisible();
    });
  }
});
