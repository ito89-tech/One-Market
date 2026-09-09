# ローカル動作確認レポート

作成日: 2026-09-09  
対象: ワンマケ Local MVP（本番デプロイは含まない）

---

## 1. 実行環境

| 項目 | 値 |
| --- | --- |
| OS | Windows 10 (build 26200) |
| Node.js | v26 |
| Python | 3.12 |
| Docker | 未インストール（使用せず） |
| PostgreSQL | PGlite 0.5.8（ポート 55432） |
| 診断エンジン | FastAPI / uvicorn 127.0.0.1:8000 |
| Web | Next.js 16.3.4 `npm run start` :3000 |
| 決済 | `PAYMENT_PROVIDER=mock`（TEST ONLY） |

本機では Windows 管理者アカウントのためネイティブ `postgres.exe` が起動できません。
本番と同じ Prisma スキーマで接続できるよう、開発 DB は PGlite です。

---

## 2. 起動コマンド

```bash
cd web
npm install
copy .env.example .env

npm run db:start      # 常駐
npm run db:migrate
npm run db:seed
npm run engine:start  # 別ターミナル
npm run dev           # または npm run start
```

ブラウザ: http://localhost:3000

ローカル確認用（TEMP）:

- `admin@onemake.local` / `onemake-local-pass`（管理者）
- `user@onemake.local` / `onemake-local-pass`（一般）

---

## 3. 実装した機能

既存の診断エンジン・Next.js・認証・管理画面を再利用し、不足していたローカル完走用の部品を足しました。

- `PAYMENT_PROVIDER=mock` / `stripe` の切替。Mock は localhost / 127.0.0.1 のみ。`sk_live` と `VERCEL_ENV=production` では無効
- `/checkout/mock` と `POST /api/payments/mock/complete`（「これは開発環境用のテスト決済です」）
- Stripe Checkout / Webhook は既存。署名検証あり。キー未設定でもクラッシュせず「準備中」
- 有料枠の付与を `grantPaidCredits` に集約（Webhook と Mock で共用、同一セッションは二重付与しない）
- 診断トランザクション内で外側 Prisma を呼ばないよう修正（PGlite の同時接続タイムアウト）
- シードにローカル確認ユーザー
- `npm run engine:start` / `npm run db:migrate`
- マイページに決済状態
- 管理画面に Mock 警告

診断ロジック・ODS・駅優先判定は変更していません。

---

## 4. DB 構成

Prisma / PostgreSQL。主要テーブル: `User` `Session` `PropertyDiagnosis` `Payment` `Subscription` `StripeEvent` と収益率マスタ（`YieldSheet` `Area` `Station` `Municipality` `AgeBracket` `YieldRate` `DataIssue`）。

シード実績: シート 4、エリア 14、駅 249、市区町村 36、築年数区分 140、収益率セル 490、問題 10。

`DATABASE_URL` の `pgbouncer=true&connection_limit=1` は PGlite 用です。本番では外します。

---

## 5. 診断ロジック

変更なし。

- 月間実質収入 = 賃料 − 管理費 − 修繕積立金。年間 × 12。内部収益率 = 年間 ÷ 物件価格 × 100
- 相場価格 = 年間 ÷ 高収益率 〜 年間 ÷ 低収益率
- 判定はセルの `[low, high]`（全エリア共通の 3.19/3.20 固定閾値は使わない）
- 照合順: 駅 → 市区町村（区→市）→ その他。逆順にはしない
- 駅徒歩は保存のみ。計算未使用
- 東京④・築35以上 `4.70%-4.49%` は `DATA_UNAVAILABLE`。値は推測しない

横浜駅・築7年・2670万円の例: 割安、相場 2,758万円〜2,922万円。

---

## 6. Stripe / Mock Payment

| 項目 | 状態 |
| --- | --- |
| Mock Payment | ローカルで動作。画面に TEST ONLY。本番ホストでは無効 |
| Stripe Checkout | 実装済み。`STRIPE_SECRET_KEY` と `STRIPE_PRICE_ID` が必要 |
| Webhook 署名検証 | 単体テストで確認。Stripe CLI はこのマシンに無いため live listen は未実施 |
| 料金・Price ID | 未確定。コードへ埋め込んでいない |

---

## 7. E2E 結果

Playwright（desktop + mobile / iPhone 13）。本機 Chrome。

```
60 passed (1.7m)
```

含む: LP CTA、入力後会員登録、診断結果（利回り非表示）、駅優先（横浜駅/横浜市/武蔵小杉/川崎市）、境界値 3.19/3.20/3.39/3.40、他人の診断 404、一般ユーザーの管理画面 404、管理者ログイン、Mock 決済 → 有料診断、横スクロールなし。

ブラウザ手動: LP → 入力 → 登録 → 結果（割安）→ マイページ → Mock 決済成功（残り1回）→ 一般ユーザーの `/admin` は 404。

---

## 8. Lint / Typecheck / Build 結果

| コマンド | 結果 |
| --- | --- |
| `cd engine && pytest -q` | 56 passed |
| `cd web && npm test` | 61 passed |
| `npm run typecheck` | 成功 |
| `npm run lint` | 成功 |
| `npm run build` | 成功（`/checkout/mock` `/api/payments/mock/complete` を含む） |

---

## 9. 未解決問題

- 東京④・築35年以上の不正レンジは未修正（意図どおり）
- Stripe CLI / Test Mode の実カード決済はこのマシンでは未実施
- Docker Compose の PostgreSQL は未導入（Docker が無いため PGlite を継続）
- 管理画面の 404 英語デフォルト（存在を隠すための仕様）

---

## 10. クライアント確認事項

[docs/open-questions.md](open-questions.md) を参照。

1. 東京④・築35年以上の正しい収益率  
2. 有料診断の料金  
3. 都度課金かサブスクリプションか  
4. Stripe Price ID  
5. 都道府県・市区町村を正式項目にするか  
6. 駅徒歩を計算に使うか  
7. 市区町村を区→市にするか  
8. 駅名表記ゆれ  
9. 相場価格の丸め  

---

## 11. 本番移行時に必要な作業

[docs/production-checklist.md](production-checklist.md) を参照。

要点: マネージド PostgreSQL、`PAYMENT_PROVIDER=stripe`、Live キー、確定 Price ID、HTTPS Webhook、`SEED_LOCAL_USERS=false`、`AUTH_SECRET` の差し替え、Mock が残っていないことの確認。

---

## 12. 運用コマンド（追記）

- Stripe CLI 1.50.10 を winget で導入済み（`stripe version 1.50.10`）
- `npm run setup:local` / `npm run local` を追加
- `LOCAL_TEST_PRICE_ID` は localhost の Test Mode 専用
- `stripe listen` はこの PC 未ログインのため Webhook 実受信は **未確認**
- 決済の実操作確認は Mock Payment

---

## 完成条件チェック

```
[x] Next.js起動
[x] Python起動
[x] PostgreSQL起動（PGlite）
[x] DB Migration
[x] DB Seed
[x] LP
[x] CTA
[x] 物件入力
[x] バリデーション
[x] 会員登録
[x] ログイン
[x] 診断
[x] エリア判定
[x] 駅優先判定
[x] 築年数判定
[x] 収益率参照
[x] 相場価格
[x] 割安判定
[x] 相場通り判定
[x] 割高判定
[x] 結果画面
[x] マイページ
[x] 無料診断
[x] 有料案内
[x] Mock Payment
[ ] Stripe Test Mode（CLI 導入済み。`stripe login` 未実施のため Checkout 実決済は未確認）
[x] Webhook（署名検証の単体テスト。listen 実受信は未確認）
[x] 有料権限
[x] 管理画面
[x] 権限管理
[x] E2E PC
[x] E2E Mobile
[x] Lint
[x] Typecheck
[x] Build
[x] README
[x] .env.example
[x] docs
[x] open-questions
```
