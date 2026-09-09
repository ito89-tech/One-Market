# ワンマケ 現状資料

作成日: 2026-09-09  
対象環境: この PC 上の Local MVP（本番デプロイは含まない）  
対象 URL: http://localhost:3000

この文書は「コードが存在する」ではなく、**いま動いているシステムの実体**を説明します。  
設計の詳細は既存の仕様書へリンクし、ここでは現状の動き・構成・到達点を優先します。

| 区分 | 意味 |
| --- | --- |
| **確認済み** | この PC で起動し、ブラウザまたは自動テストで検証した |
| **未確認** | 実装はあるが、この PC では実操作まで到達していない |
| **未確定** | クライアント確認待ち。勝手に本番仕様として決めていない |

---

## 1. いまの到達点（結論）

ワンマケは **ローカル完全動作版（Local MVP）** まで進んでいます。

新しいターミナルから README の手順で、

1. 依存関係と DB を初期化する  
2. FastAPI と Next.js を起動する  
3. ブラウザで http://localhost:3000 を開く  
4. 物件入力 → 会員登録 → 診断 → マイページ → Mock 決済 → 有料診断  

まで、この PC で再現できます。

**本番公開・本番決済・本番料金の確定はしていません。**

| 項目 | 状態 |
| --- | --- |
| 診断（割安 / 相場通り / 割高） | 確認済み |
| 会員登録・ログイン・マイページ | 確認済み |
| 管理画面（管理者のみ） | 確認済み |
| Mock Payment（開発用テスト決済） | 確認済み |
| Stripe Checkout / Webhook のコード | 実装済み |
| Stripe Test Mode の実カード決済 | **未確認**（CLI 導入済み、Dashboard ログイン未実施） |
| 本番デプロイ | **未実施** |

---

## 2. サービスが何をするか

ワンマケは、ワンルーム投資物件の提示価格が、エリアと築年数の基準から見て

- 割安
- 相場通り
- 割高

のどれかを確認する Web サービスです。

内部では収益率（利回り）を使いますが、**利用者の画面には利回りを主要結果として出しません。**  
出すのは判定、相場価格（万円帯）、提示価格との差額です。

基準データの正本はクライアント提供の `利回りシート .ods` です。  
シートに無い値は推測・補完しません。データが不正なセルは診断せず `DATA_UNAVAILABLE` になります。

---

## 3. この PC でいま動いているもの

確認時点の実行環境です。

| 層 | 実装 | ローカルの実体 | ポート |
| --- | --- | --- | --- |
| ブラウザ UI / API | Next.js 16.3（App Router, TypeScript, React 19） | `web/` | 3000 |
| 診断計算 | FastAPI + uvicorn（Python 3.12） | `engine/` | 8000 |
| データベース | Prisma → PostgreSQL 互換 | PGlite 0.5.8 | 55432 |
| 決済（ローカル既定） | Mock Payment | `PAYMENT_PROVIDER=mock` | — |

Docker とネイティブ PostgreSQL は使いません。  
この Windows 管理者アカウントでは `postgres.exe` が起動できないため、開発 DB は PGlite です。  
スキーマは本番想定の PostgreSQL と同じで、差し替えるのは `DATABASE_URL` だけです。

起動のまとめ:

```
ブラウザ
  → Next.js :3000
      ├─ Prisma → PGlite :55432
      └─ サーバー内部からだけ FastAPI :8000 を呼ぶ
```

エンジンは外部公開しません。落ちていても LP と会員機能は動きます。診断だけ 503 になります。

---

## 4. 利用者から見た動き

確定しているユーザーフローです。会員登録は最初に要求しません。

```
LP（/）
  「無料で相場を確認してみる」
    → 物件情報入力（/diagnosis/new）
      → 会員登録 / ログイン案内
        → 登録またはログイン
          → 入力済み物件を引き継いで診断実行（/diagnosis/run）
            → 診断結果（/diagnosis/[id]）
              → マイページ（/mypage）
                → 2 回目以降は有料案内
                  → Mock または Stripe Checkout
                    → サーバーが決済状態を更新
                      → 有料診断が利用可能
```

入力途中の値はブラウザに一時保存し、登録・ログイン後に復元します。

### 入力項目

指示書の 7 項目に加え、シート特定と市区町村フォールバックのため **都道府県・市区町村** を必須にしています（仮仕様 ASSUMPTION-1。本番で外すかは未確定）。

| 項目 | 単位 | 備考 |
| --- | --- | --- |
| 都道府県 | 選択 | 参照シートの決定 |
| 市区町村 | 文字列 | 駅が未登録のときのフォールバック |
| 物件価格 | 万円 | 0 は不可 |
| 築年数 | 年 | 0〜120 |
| 最寄り駅 | 文字列 | マスタ補完。照合は正規化後の完全一致 |
| 駅徒歩 | 分 | **保存のみ。診断計算には使わない** |
| 月額賃料 | 円 | |
| 管理費 | 円 | |
| 修繕積立金 | 円 | 管理費＋修繕積立金 ≥ 賃料 はエラー |

### 確認済みの診断例（横浜駅）

| 入力 | 値 |
| --- | --- |
| 物件価格 | 2,670 万円 |
| 築年数 | 7 年 |
| 駅 | 横浜駅 |
| 賃料 / 管理費 / 修繕積立金 | 90,000 / 7,820 / 4,260 円 |

| 結果 | 値 |
| --- | --- |
| エリア | ①（駅一致。横浜市③ではない） |
| 判定 | 割安 |
| 相場 | 2,758 万円〜2,922 万円 |

内部収益率はユーザー画面に出していません。

駅優先の確認済み例:

| 入力 | 採用 | フォールバック |
| --- | --- | --- |
| 横浜駅 | ① | 駅が無い場合の横浜市は ③ |
| 武蔵小杉駅 | ② | 駅が無い場合の川崎市は ③ |

「駅名が市区町村に似ている」ことだけでは市区町村判定しません。  
`横浜駅` ≠ `横浜市`、`武蔵小杉駅` ≠ `川崎市`。

---

## 5. 技術構成

### 5.1 リポジトリ配置

```
One-Market/
├─ 利回りシート .ods          クライアント提供の原本（変更しない）
├─ data/yield-master.json     .ods から生成した正規化マスタ
├─ tools/                     変換スクリプト
├─ docs/                      設計・現状・未確定・本番チェックリスト
├─ engine/                    FastAPI 診断エンジン（状態を持たない）
│  └─ app/
│     ├─ main.py              HTTP
│     ├─ schemas.py           入出力
│     ├─ dataset.py           マスタ読込
│     └─ diagnosis.py         純粋な診断ロジック
└─ web/                       Next.js
   ├─ prisma/                 スキーマと seed
   ├─ scripts/                PGlite / 一括起動 / Stripe CLI 補助
   └─ src/
      ├─ app/                 画面と Route Handlers
      ├─ components/
      ├─ lib/                 認証・環境変数・エンジンクライアント
      └─ server/              診断実行・課金付与
```

### 5.2 なぜ 3 層か

指示書が Frontend = Next.js、診断 = Python を指定しています。

- **エンジン**は DB もセッションも持たない計算サービスです。データ更新は JSON 差し替えと再起動で足ります。
- **認証・課金・権限**は Next.js に集約します。フロントのフラグは信用しません。
- **DB** はユーザー、セッション、診断履歴、決済、収益率マスタを持ちます。

### 5.3 データの流れ

```
利回りシート .ods
  → tools/build_yield_dataset.py   （値の補完はしない。異常は issues に記録）
    → data/yield-master.json
         ├─ web/prisma/seed.ts  → PGlite（画面・管理・駅名補完）
         └─ engine 起動時ロード → 診断計算
```

表示と計算は同じ JSON を出所にします。  
更新手順は `.ods` 差し替え → 変換 → `npm run db:seed` → エンジン再起動、だけです。アプリケーションコードは書き換えません。

シード実績（ローカル）:

| マスタ | 件数 |
| --- | --- |
| シート | 4 |
| エリア | 14 |
| 駅 | 249 |
| 市区町村 | 36 |
| 築年数区分 | 140 |
| 収益率セル | 490 |
| データ問題 | 10 |

### 5.4 主要ライブラリ（この PC）

| 領域 | バージョン目安 |
| --- | --- |
| Node.js | 20 以上（確認環境 v26、`.nvmrc` は 20） |
| Next.js / React | 16.3.4 / 19.2.8 |
| Prisma | 6.19 |
| PGlite | 0.5.8 |
| Python | 3.12（`engine/.python-version`） |
| FastAPI / uvicorn | 0.121.2 / 0.39.0 |
| Stripe SDK | 20.x（サーバー） |
| Stripe CLI | 1.50.10（導入済み、未ログイン） |
| Playwright / Vitest | 1.56 / 3.2 |

---

## 6. 診断ロジック（変更していない）

実装の正本は `engine/app/diagnosis.py` です。この作業ではロジックと ODS 値を変えていません。

処理順:

1. 都道府県 → 参照シート  
2. 駅名 → 市区町村（区 → 市 → 町/村）→ その他、の順でエリア  
3. 築年数 → `0~1` / `2〜34` の同年 / `35以上`  
4. シート × エリア × 築年数の交点から収益率レンジ `[low, high]`  
5. 収支と判定

計算:

```
月間実質収入 = 賃料 − 管理費 − 修繕積立金
年間実質収入 = 月間実質収入 × 12
内部収益率(%) = 年間実質収入 ÷ 物件価格 × 100
```

相場価格:

```
下限 = 年間実質収入 ÷ (high / 100)
上限 = 年間実質収入 ÷ (low  / 100)
```

収益率が高いほど価格は安くなるため、**high が下限価格、low が上限価格**です。  
表示は万円の整数。判定は丸め前の収益率とセル `[low, high]` を比較します。

| 条件 | 判定 |
| --- | --- |
| 収益率 < low | 割高 |
| low ≤ 収益率 ≤ high | 相場通り |
| 収益率 > high | 割安 |

閾値 3.19 / 3.20 / 3.39 / 3.40 は全エリア共通の固定値ではありません。  
東京①・築 6〜9 年のセル `[3.20, 3.39]` に代入すると指示書の例と一致します。境界は E2E で確認済みです。

東京④・築 35 年以上のシート値 `4.70%-4.49%` は下限が上限を上回るため `valid: false` です。  
**DATA_UNAVAILABLE を維持**しています。値の推測はしません。該当診断は無料枠も消費しません。

詳細: [diagnosis-logic.md](diagnosis-logic.md)

---

## 7. 認証・権限・課金

### 7.1 認証

JWT は使いません。無料枠と権限がサーバー状態に依存するため、失効を即座に反映します。

- パスワード: bcrypt（cost 12）
- セッション: 32 バイト乱数。DB には SHA-256 ハッシュのみ。平文は httpOnly Cookie
- Cookie: `httpOnly`, `sameSite=lax`, 本番は `secure`, 有効期限 30 日
- CSRF: SameSite=Lax に加え、状態変更 API は Origin 検証
- 診断・決済の取得は必ず `userId` を条件にする。他人の ID は 404

### 7.2 診断の利用枠

フロントのフラグは見ません。

| 条件 | 結果 |
| --- | --- |
| `User.freeDiagnosisUsedAt` が null | 無料診断 |
| `User.paidCredits` > 0 | 有料残数を 1 消費 |
| Subscription が `ACTIVE` / `TRIALING` | 有料扱い（残数消費なし） |
| 上記以外 | 有料案内 |

データ不足やエンジン停止では枠を消費しません。

PGlite は同時接続 1 本です。診断トランザクション内では外側の Prisma クライアントを呼ばない実装になっています（以前ここで有料診断がハングしたため修正済み）。

### 7.3 決済の切替

| `PAYMENT_PROVIDER` | 動き |
| --- | --- |
| `mock` | `/checkout/mock`。「これは開発環境用のテスト決済です」。localhost のみ |
| `stripe` | Stripe Checkout。`sk_test_` と Price ID が必要 |
| キー不足 | クラッシュせず「有料診断は現在準備中です」 |

Mock は次のいずれかで無効です。

- `PAYMENT_PROVIDER` が `mock` 以外
- アプリ URL が localhost / 127.0.0.1 以外
- `VERCEL_ENV=production`
- `STRIPE_SECRET_KEY` が `sk_live` で始まる

権限付与は完了画面だけでは行いません。Mock 完了 API または署名済み Stripe Webhook が `grantPaidCredits` を呼びます。同じセッションの二重付与はしません。

`LOCAL_TEST_PRICE_ID` は localhost の Test Mode 専用です。公開ホストと Vercel production では無視します。  
本番料金確定後は `STRIPE_PRICE_ID` だけ差し替え、`LOCAL_TEST_PRICE_ID` は空にします。

Stripe Test Mode の実 Checkout → Webhook 実受信は、この PC では **未確認** です。`stripe login` が必要です。

---

## 8. 画面と API

### 8.1 画面

| パス | 内容 | 認証 |
| --- | --- | --- |
| `/` | LP | 不要 |
| `/diagnosis/new` | 物件入力 | 不要 |
| `/signup` `/login` | 会員登録 / ログイン | 不要 |
| `/diagnosis/run` | 診断実行 | 必要 |
| `/diagnosis/[id]` | 結果（本人のみ） | 必要 |
| `/mypage` | 履歴と利用状況 | 必要 |
| `/checkout/mock` | 開発用テスト決済 | 必要 |
| `/checkout/success` `/cancel` | Stripe 戻り | 必要 |
| `/admin/*` | 管理（ユーザー・診断・決済・データ問題） | ADMIN のみ。他は 404 |

### 8.2 Next.js API（公開）

成功 `{ ok: true, data }`、失敗 `{ ok: false, error: { code, message, details } }`。

| メソッド | パス | 用途 |
| --- | --- | --- |
| POST | `/api/diagnosis/preview` | 入力検証のみ。結果は返さない |
| POST | `/api/diagnosis` | 診断実行・保存・枠消費 |
| GET | `/api/diagnosis/:id` | 自分の結果のみ |
| POST | `/api/auth/register` `/login` `/logout` | 会員 |
| GET | `/api/me` | アカウントと利用状況 |
| GET | `/api/master/stations` `/municipalities` | 入力補完 |
| POST | `/api/stripe/checkout` | Checkout。mock 時は `/checkout/mock` |
| POST | `/api/stripe/webhook` | 署名検証して決済反映 |
| POST | `/api/payments/mock/complete` | ローカル専用。本番では 403 |

内部利回りとエリアコードは公開 API に含めません。管理画面のみです。

### 8.3 エンジン API（非公開）

| メソッド | パス | 用途 |
| --- | --- | --- |
| GET | `/health` | 死活と読込件数 |
| POST | `/diagnose` | 診断計算 |
| GET | `/dataset/issues` | データ検証結果 |

---

## 9. データベース

正本: `web/prisma/schema.prisma`

```
User 1──* Session
     1──* PropertyDiagnosis
     1──* Payment
     1──* Subscription

YieldSheet 1──* Area 1──* Station
                       1──* Municipality
           1──* AgeBracket
           1──* YieldRate
Payment / StripeEvent / DataIssue
```

駅と市区町村は別テーブルです。1 カラムに混ぜません。  
診断行は実行時点の入力と基準値をスナップショット保存します。マスタ更新後も履歴を再現できます。

開発の `DATABASE_URL` には `pgbouncer=true&connection_limit=1` が付きます（PGlite 制約）。本番では外します。

詳細: [database.md](database.md)

---

## 10. 起動方法

### 初回（新しい PC / このリポジトリを初めて触るとき）

```bash
cd web
npm ci
copy .env.example .env
npm run setup:local
npm run local
```

`setup:local` は `.env` 確認、エンジン venv、PGlite 起動、migrate、seed まで行います。  
Stripe へのログインはしません。

### 日常

```bash
cd web
npm run local
```

別名: `npm run dev:all`  
ポート 55432 / 8000 / 3000 が既に開いていれば再利用します。

個別コマンド（残してあります）:

```bash
npm run db:start
npm run db:migrate
npm run db:seed
npm run engine:start
npm run dev
```

### テストアカウント（TEMP）

パスワードはすべて `onemake-local-pass`。本番には作りません（`SEED_LOCAL_USERS=false`）。

| メール | 用途 |
| --- | --- |
| `admin@onemake.local` | 管理者。`/admin` |
| `user@onemake.local` | 一般・未決済 |
| `paid@onemake.local` | 無料枠使用済み＋有料残数 1（初回シード作成時） |

一般ユーザーが `/admin` を開くと 404 です（管理画面の存在を隠すため）。

環境変数の一覧は `web/.env.example`。Secret の実値は Git に入れません。  
コード上のエンジン URL 名は `DIAGNOSIS_ENGINE_URL` です。

---

## 11. テスト結果（この PC）

| コマンド | 結果 |
| --- | --- |
| `cd engine && pytest -q` | 56 passed |
| `cd web && npm test` | 63 passed |
| `npm run lint` | 成功 |
| `npm run typecheck` | 成功 |
| Next.js build | 成功 |
| Playwright（PC + スマホ幅） | 60 passed |

E2E に含むもの: LP CTA、入力後会員登録、利回り非表示、横浜駅/横浜市、武蔵小杉/川崎市、3.19〜3.40 境界、他人の診断 404、一般ユーザーの管理画面 404、Mock 決済 → 有料診断、390px 相当で横スクロールなし。

ブラウザ手動（確認済み）:

- LP 表示、CTA
- 横浜駅の入力〜割安結果
- 会員登録、マイページ
- Mock 決済成功、有料残数 1
- 一般ユーザーの `/admin` = 404
- 390px 幅で LP / 入力 / ログイン / 会員登録（横オーバーフロー 0）

`npm run build`（`prisma generate && next build`）は、Next.js が起動中だと Prisma エンジン DLL のリネームで EPERM になることがあります。そのときは Next を止めてから実行します。`npx next build` 単体は成功しています。

---

## 12. 確認済み / 未確認

### 確認済み

- Node.js / Python / npm / PGlite / FastAPI / Next.js の起動
- `npm run setup:local` / `npm run local`
- 収益率マスタの seed（冪等。確認ユーザーの有料残数は初回作成時のみ付与）
- 診断ロジックと駅優先
- 無料 1 回 → 有料案内 → Mock → 有料診断
- 他人の診断非表示
- 管理画面の権限制御
- PC と 390px
- lint / typecheck / build / pytest / Vitest / Playwright

### 未確認

- `stripe login` 後の Test Mode Checkout（テストカード）
- `stripe listen` による Webhook 実受信と、それ経由の有料解放
- Docker / マネージド PostgreSQL
- 本番ドメイン、HTTPS、Live キー
- パスワード再設定メール（MVP スコープ外）

### 意図的にやらないこと（現状維持）

- 診断ロジックの変更
- ODS / yield-master の値の推測・補正
- 東京④・築35年以上の仮値埋め
- 本番料金・課金方式・Stripe Price ID の決定
- 本番デプロイ

---

## 13. クライアント確認が必要な事項

詳細は [open-questions.md](open-questions.md)。勝手に決めていません。

1. 東京④・築35年以上の正しい収益率（BLOCKER）
2. 有料診断の本番料金
3. 都度課金かサブスクリプションか
4. 本番 Stripe Price ID
5. 都道府県・市区町村を正式項目にするか
6. 駅徒歩を診断計算に使うか
7. 区→市の照合順を維持するか
8. 駅名の表記ゆれ辞書を作るか
9. 相場価格の丸め方法

ローカルの仮スイッチ（本番仕様ではない）:

- `PAYMENT_PROVIDER=mock` または `stripe`
- `STRIPE_MODE=payment`（既定）
- `STRIPE_CREDITS_PER_PURCHASE=1`
- `LOCAL_TEST_PRICE_ID`（Test Mode 専用）

---

## 14. 本番化との境界

今回の目的は本番公開ではありません。差し替え点は [production-checklist.md](production-checklist.md) にあります。

最低限:

- マネージド PostgreSQL。`pgbouncer=true&connection_limit=1` を外す
- `PAYMENT_PROVIDER=stripe`。Mock を残さない
- Live キー、クライアント確定の `STRIPE_PRICE_ID`、HTTPS Webhook
- `LOCAL_TEST_PRICE_ID` を空にする
- `SEED_LOCAL_USERS=false`。`*.onemake.local` を残さない
- `AUTH_SECRET` を乱数に差し替える
- エンジンは内部ネットワークのみ
- 東京④の正しいセルをシートで受領して再変換

推奨順は Local → Staging（Stripe Test Mode）→ Production です。

---

## 15. 関連資料

| 文書 | 内容 |
| --- | --- |
| [README.md](../README.md) | この README だけで起動できる手順 |
| [requirements.md](requirements.md) | 要件 |
| [architecture.md](architecture.md) | 設計時のアーキテクチャ |
| [database.md](database.md) | DB 設計 |
| [diagnosis-logic.md](diagnosis-logic.md) | 診断仕様 |
| [ui-spec.md](ui-spec.md) | 画面仕様 |
| [test-plan.md](test-plan.md) | テスト計画 |
| [data-validation.md](data-validation.md) | データ検証 |
| [open-questions.md](open-questions.md) | 未確定事項 |
| [production-checklist.md](production-checklist.md) | 本番移行 |
| [local-completion-report.md](local-completion-report.md) | ローカル動作確認の作業記録 |

起動手順の正本は README です。本資料は「いま何が動いていて、どこまで終わったか」の説明です。
