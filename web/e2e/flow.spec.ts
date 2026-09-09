import { expect, test } from "@playwright/test";

import {
  PASSWORD,
  expectNoHorizontalScroll,
  fillPropertyForm,
  isResultUrl,
  login,
  logout,
  register,
  signUpAndDiagnose,
  submitProperty,
  uniqueEmail,
  waitForResult,
  watchDuplicateKeyErrors,
} from "./helpers";

test.describe("LP から診断結果までの導線", () => {
  test("会員登録を求められるのは物件情報の入力後", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /相場と比べてどうですか/ }),
    ).toBeVisible();

    await page
      .getByRole("link", { name: "無料で相場を確認してみる" })
      .first()
      .click();

    await expect(page).toHaveURL(/\/diagnosis\/new/);
    // 入力画面に到達するまで会員登録・ログインを要求しない
    await expect(page.getByLabel("物件価格")).toBeVisible();
    await expect(page.getByLabel("パスワード")).toHaveCount(0);

    await fillPropertyForm(page);
    await submitProperty(page);

    await expect(page).toHaveURL(/\/signup\?next=/);
    expect(new URL(page.url()).searchParams.get("next")).toBe("/diagnosis/run");
  });

  test("初回は無料で診断でき、結果に判定・相場価格・差額が出る", async ({ page }) => {
    await signUpAndDiagnose(page, uniqueEmail("flow"));

    await expect(page.getByRole("heading", { level: 1 })).toContainText("相場");
    await expect(page.getByText(/判定：(割安|相場通り|割高)/)).toBeVisible();
    await expect(page.getByText("相場価格", { exact: true })).toBeVisible();
    await expect(page.getByText("提示価格", { exact: true })).toBeVisible();
    await expect(page.getByText("2,670万円")).toBeVisible();

    // クライアント提供の計算例（横浜駅・築7年）は割安側に出る
    await expect(page.getByText("判定：割安")).toBeVisible();
    await expect(page.getByText(/相場より .*万円 ほど安い価格です/)).toBeVisible();
  });

  test("診断結果に内部計算用の利回りを表示しない", async ({ page }) => {
    await signUpAndDiagnose(page, uniqueEmail("internal"));

    const body = (await page.locator("body").innerText()).replace(/\s/g, "");

    expect(body).not.toContain("利回り");
    expect(body).not.toContain("収益率");
    expect(body).not.toMatch(/\d+\.\d+%/);
    // エリア判定用の内部コードやシート名も出さない
    expect(body).not.toContain("kanto");
    expect(body).not.toContain("エリア1");
  });

  test("結果ページを再読み込みしても壊れない", async ({ page }) => {
    const url = await signUpAndDiagnose(page, uniqueEmail("reload"));

    await page.reload();
    await expect(page).toHaveURL(url);
    await expect(page.getByText(/判定：(割安|相場通り|割高)/)).toBeVisible();
  });

  test("入力途中で再読み込みしても入力内容が残る", async ({ page }) => {
    await page.goto("/diagnosis/new");
    await fillPropertyForm(page);

    await page.reload();

    await expect(page.getByLabel("物件価格")).toHaveValue("2670");
    await expect(page.getByLabel("最寄り駅")).toHaveValue("横浜駅");
  });
});

test.describe("2回目以降と有料導線", () => {
  test("無料診断のあとは有料案内になり、勝手に診断されない", async ({ page }) => {
    await signUpAndDiagnose(page, uniqueEmail("second"));

    await page.goto("/diagnosis/new");
    await fillPropertyForm(page, { priceMan: "3000" });
    await submitProperty(page);

    await expect(page).toHaveURL(/\/diagnosis\/run/);
    await expect(
      page.getByRole("heading", { name: "2回目以降の診断は有料です" }),
    ).toBeVisible();

    // 決済していない状態で結果画面へ進まないこと
    expect(isResultUrl(new URL(page.url()))).toBe(false);
  });

  test("Mock Payment で有料枠を付けたあと、2回目の診断ができる", async ({
    page,
  }) => {
    await signUpAndDiagnose(page, uniqueEmail("paid"));

    await page.goto("/diagnosis/new");
    await fillPropertyForm(page, { priceMan: "3000" });
    await submitProperty(page);

    await expect(
      page.getByRole("heading", { name: "2回目以降の診断は有料です" }),
    ).toBeVisible();
    await expect(page.getByText("1,100円 / 1回")).toBeVisible();
    await expect(page.getByText("2,200円 / 月")).toBeVisible();
    await expect(page.getByText("5,500円 / 月")).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByRole("button", { name: "このプランでお支払いに進む" }).click();
    await expect(page).toHaveURL(/\/checkout\/mock/);
    await expect(
      page.getByText("これは開発環境用のテスト決済です"),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByRole("button", { name: "テスト決済を成功させる" }).click();
    await expect(page).toHaveURL(/\/checkout\/success/);
    await expect(page.getByText("有料診断をご利用いただけます")).toBeVisible();

    await page.getByRole("link", { name: "入力済みの物件を診断する" }).click();
    await waitForResult(page);
    await expect(page.getByText(/判定：(割安|相場通り|割高)/)).toBeVisible();

    await page.goto("/mypage");
    await expect(page.getByText("お支払い済み")).toBeVisible();
    await expect(page.getByText("有料診断").first()).toBeVisible();
  });

  test("マイページに利用状況と履歴が出る", async ({ page }) => {
    await signUpAndDiagnose(page, uniqueEmail("mypage"));

    await page.goto("/mypage");
    await expect(page.getByRole("heading", { name: "マイページ" })).toBeVisible();
    await expect(page.getByText("利用済み")).toBeVisible();
    await expect(page.getByRole("link", { name: /診断結果を見る|横浜/ }).first()).toBeVisible();
  });
});

test.describe("入力バリデーション", () => {
  test("空欄のまま送信すると項目ごとに日本語で指摘される", async ({ page }) => {
    await page.goto("/diagnosis/new");
    await submitProperty(page);

    await expect(page.getByText("最寄り駅を入力してください")).toBeVisible();
    await expect(page.getByText("物件価格を入力してください")).toBeVisible();
    await expect(page).toHaveURL(/\/diagnosis\/new/);
  });

  test("マイナス値・文字列・過大な値を拒否する", async ({ page }) => {
    await page.goto("/diagnosis/new");
    await fillPropertyForm(page, {
      priceMan: "-100",
      monthlyRentYen: "たかい",
      walkMinutes: "999",
    });
    await submitProperty(page);

    await expect(page.getByText(/物件価格は1以上/)).toBeVisible();
    await expect(page.getByText(/月額賃料は半角数字/)).toBeVisible();
    await expect(page.getByText(/駅徒歩分数は120以下/)).toBeVisible();
  });

  test("実質収入が0円以下になる組み合わせを止める", async ({ page }) => {
    await page.goto("/diagnosis/new");
    await fillPropertyForm(page, {
      monthlyRentYen: "10000",
      managementFeeYen: "6000",
      repairReserveYen: "4000",
    });
    await submitProperty(page);

    await expect(page.getByText(/実質収入が0円以下/)).toBeVisible();
  });

  test("サーバー側でも同じ検証が行われる", async ({ page, request }) => {
    await page.goto("/");
    const response = await request.post("/api/diagnosis/preview", {
      data: { prefecture: "東京都", municipality: "渋谷区", station: "渋谷", priceMan: -1 },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.details.priceMan).toBeTruthy();
  });
});

test.describe("アカウントとデータ分離", () => {
  test("ログアウトとログインができる", async ({ page }) => {
    const email = uniqueEmail("session");
    await signUpAndDiagnose(page, email);

    await logout(page);
    await page.goto("/mypage");
    await expect(page).toHaveURL(/\/login/);

    await login(page, email);
    await expect(page).toHaveURL(/\/mypage/);
    await expect(page.getByText(email).first()).toBeVisible();
  });

  test("他人の診断結果は閲覧できない", async ({ page, browser }) => {
    const victimUrl = await signUpAndDiagnose(page, uniqueEmail("victim"));
    const diagnosisId = victimUrl.split("/").pop()!;

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto("/diagnosis/new");
    await fillPropertyForm(otherPage);
    await submitProperty(otherPage);
    await otherPage.waitForURL(/\/signup/);
    await register(otherPage, uniqueEmail("attacker"));
    await waitForResult(otherPage);

    const pageResponse = await otherPage.goto(`/diagnosis/${diagnosisId}`);
    expect(pageResponse?.status()).toBe(404);
    await expect(otherPage.getByText(/判定：/)).toHaveCount(0);

    // ブラウザのセッション Cookie 付きで API を叩いても取得できないこと
    const api = await otherPage.evaluate(async (id) => {
      const response = await fetch(`/api/diagnosis/${id}`);
      return { status: response.status, body: await response.text() };
    }, diagnosisId);
    expect(api.status).toBe(404);
    expect(api.body).not.toContain("marketPrice");

    await other.close();
  });

  test("未ログインでは診断 API も結果ページも使えない", async ({ page, request }) => {
    const response = await request.post("/api/diagnosis", {
      data: { prefecture: "東京都" },
    });
    expect(response.status()).toBe(401);

    await page.goto("/mypage");
    await expect(page).toHaveURL(/\/login/);
  });

  test("管理画面は一般ユーザーには存在しないものとして扱う", async ({ page }) => {
    await signUpAndDiagnose(page, uniqueEmail("nonadmin"));

    const response = await page.goto("/admin");
    expect(response?.status()).toBe(404);
  });

  test("シードした管理者は管理画面を開ける", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("メールアドレス").fill("admin@onemake.local");
    await page.getByLabel("パスワード").fill("onemake-local-pass");
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(page).toHaveURL(/\/mypage/);

    const response = await page.goto("/admin");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "管理画面" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("同じメールアドレスでは二重に登録できない", async ({ page }) => {
    const email = uniqueEmail("dup");
    await signUpAndDiagnose(page, email);
    await logout(page);

    await page.goto("/signup");
    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード").fill(PASSWORD);
    await page.getByRole("button", { name: "登録して診断結果を見る" }).click();

    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL(/\/signup/);
  });
});

test.describe("表示", () => {
  test("主要画面で横スクロールが発生しない", async ({ page }) => {
    await page.goto("/");
    await expectNoHorizontalScroll(page);

    await page.goto("/diagnosis/new");
    await expectNoHorizontalScroll(page);

    await page.goto("/login");
    await expectNoHorizontalScroll(page);

    await page.goto("/signup");
    await expectNoHorizontalScroll(page);

    await signUpAndDiagnose(page, uniqueEmail("layout"));
    await expectNoHorizontalScroll(page);

    await page.goto("/mypage");
    await expectNoHorizontalScroll(page);
  });

  test("フォームのラベルと入力欄が対応している", async ({ page }) => {
    await page.goto("/diagnosis/new");

    for (const label of [
      "最寄り駅",
      "駅徒歩",
      "築年数",
      "物件価格",
      "月額賃料",
      "管理費",
      "修繕積立金",
    ]) {
      await expect(page.getByLabel(label)).toBeVisible();
    }
  });

  test("同名駅の候補でも React の重複キー警告が出ない", async ({ page }) => {
    const keyErrors = watchDuplicateKeyErrors(page);
    await page.goto("/diagnosis/new");

    await page.getByLabel("最寄り駅").fill("東京");
    await expect(page.getByRole("option").first()).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByLabel("最寄り駅").fill("赤坂");
    await expect(page.getByText("同名の駅が複数の地域にあります")).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByRole("button", { name: /赤坂/ }).first()).toBeVisible();
    await expectNoHorizontalScroll(page);

    expect(keyErrors).toEqual([]);
  });

  test("駅名の候補を選んで入力できる", async ({ page }) => {
    await page.goto("/diagnosis/new");
    await page.getByLabel("最寄り駅").fill("横浜");
    await page.getByRole("option", { name: "横浜", exact: true }).click();
    await expect(page.getByLabel("最寄り駅")).toHaveValue("横浜");
    await expect(
      page.getByText("都道府県・市区町村の入力は不要です"),
    ).toBeVisible({ timeout: 8_000 });
  });
});
