# ワンマケ

ワンルーム投資物件の提示価格が、エリアと築年数の基準から見て
割安・相場通り・割高のどれかを確認できる Web サービスです。

内部では収益率を使いますが、利用者の画面には利回りを主要結果として出しません。
判定と相場価格（万円帯）と差額だけを示します。

このリポジトリは **ローカル完全動作版（Local MVP）** です。
収益率の正本はクライアント提供の `利回りシート.xlsx` です。
変換結果は `data/yield-master.json` です。値の補完はしません。

---

## 1. プロジェクト概要

```
ブラウザ
  → Next.js (web/ :3000)
      → PostgreSQL 互換（開発は PGlite :55432。Docker 不要）
      → 診断エンジン（Next.js と同一プロセス。web/src/server/engine/）
```

常駐プロセスは Next.js と DB だけです。本番は Vercel + Neon の 2 つで動きます
（手順は `docs/deployment.md`）。

収益率の正本はクライアント提供の `利回りシート.xlsx` です。
変換結果は `data/yield-master.json` です。値の補完はしません。

---

## 2. 必要環境

| ツール | 推奨 |
| --- | --- |
| Node.js | **20 以上**（確認環境は v26。`.nvmrc` は 20） |
| npm | Node 付属 |
| Python | 任意。`tools/` の .xlsx 変換を実行するときだけ |
| Chrome | E2E と手動確認 |
| Stripe CLI | 任意。Test Mode の Webhook を受けるときだけ |

不要: Docker、ネイティブ PostgreSQL。開発 DB は PGlite です。

Windows の管理者アカウントでは `postgres.exe` が起動できないため、PGlite を使います。
本番はマネージド PostgreSQL に `DATABASE_URL` だけ差し替えます。

---

## 3. 最短セットアップ（新しい PC）

```bash
cd web
npm ci                 # lockfile どおり。初回は npm install でも可
copy .env.example .env # Windows
# cp .env.example .env

# AUTH_SECRET は本番では必ず乱数に差し替える
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

npm run setup:local    # .env 確認、DB 起動、migrate deploy、seed
npm run local          # DB + Next.js をまとめて起動
```

ブラウザ: **http://localhost:3000**

`setup:local` は Stripe へのログインをしません（Dashboard アカウントが必要です）。

---

## 4. 個別コマンド（既存。残しています）

```bash
cd web
npm run db:start       # PGlite 常駐。Ctrl+C で停止
npm run db:deploy      # prisma migrate deploy（既存の DB に適用）
npm run db:seed
npm run dev            # Next.js :3000
```

スキーマを変更したときは `npm run db:migrate`（`prisma migrate dev`）で
`prisma/migrations/` に差分を作り、コミットします。本番へはデプロイ時に
自動適用されるので、`prisma db push` は本番に使いません。

---

## 5. 1 コマンド起動

```bash
cd web
npm run local
# 同じ: npm run dev:all
```

ポート 55432 / 3000 が既に使われていれば、そのプロセスを再利用します。

---

## 6. 環境変数

一覧は `web/.env.example` です。本物の Secret は書かないでください。`.env` は Git に入れません。

| 変数 | 用途 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL。開発は `pgbouncer=true&connection_limit=1` 付き |
| `DIRECT_URL` | マイグレーション用の直結。ローカルは `DATABASE_URL` と同じで可 |
| `AUTH_SECRET` | セッショントークンの HMAC |
| `NEXT_PUBLIC_APP_URL` | アプリ URL |
| `ADMIN_EMAILS` | 管理者へ昇格するメール（カンマ区切り） |
| `PAYMENT_PROVIDER` | `mock` または `stripe` |
| `SEED_LOCAL_USERS` | 確認用ユーザーの投入 |
| `SEED_LOCAL_PASSWORD` | 確認用パスワード（未設定時は README の値） |
| `STRIPE_SECRET_KEY` | サーバー専用。`sk_test_` のみローカルで使う。`NEXT_PUBLIC_` を付けない |
| `STRIPE_WEBHOOK_SECRET` | Webhook 署名（`whsec_...`） |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Checkout 用公開鍵（`pk_test_`） |
| `STRIPE_PRICE_ID_ONE_TIME` | 1回プラン（1,100円）の Price ID |
| `STRIPE_PRICE_ID_MONTHLY_5` | 月5回までプラン（2,200円/月）の Price ID |
| `STRIPE_PRICE_ID_MONTHLY_UNLIMITED` | 回数無制限プラン（5,500円/月）の Price ID |
| `PGDEV_PORT` | PGlite のポート（既定 55432） |
| `E2E_BASE_URL` / `E2E_CHANNEL` | Playwright 用 |

コード上のエンジン URL 名は `DIAGNOSIS_ENGINE_URL` です（`ENGINE_URL` ではありません）。

---

## 7. テストアカウント（TEMP）

`npm run db:seed` 後。パスワードはすべて `onemake-local-pass`。

| メール | 用途 |
| --- | --- |
| `admin@onemake.local` | 管理者。`/admin` |
| `user@onemake.local` | 一般（未決済） |
| `paid@onemake.local` | 一般。無料枠使用済み＋有料残数 1（初回シード時） |

一般ユーザーが `/admin` を開くと 404 です。

---

## 8. Mock Payment

既定のローカル決済です。Stripe キーが無くても 3 プランの付与を確認できます。

```env
PAYMENT_PROVIDER=mock
```

2 回目の診断 → プラン選択（1,100円 / 2,200円 / 5,500円）→「テスト決済を成功させる」。
画面に **「これは開発環境用のテスト決済です」** と出ます。

本番では無効です（`PAYMENT_PROVIDER` が mock 以外、公開ホスト、`VERCEL_ENV=production`、`sk_live`）。

---

## 9. Stripe Test Mode（任意）

本番キー・本番料金は使いません。Dashboard の **Test Mode** だけです。

1. Stripe CLI（未導入なら Windows: `winget install --id Stripe.StripeCli -e`）
2. 一度だけ `stripe login`（ブラウザで Test アカウントを許可）
3. Dashboard から `sk_test_...` と `pk_test_...` を `web/.env` へ
4. 確認用 Price を作る:

```bash
cd web
npm run stripe:setup-test-price
```

表示された 3 つの `price_...` を次へ入れる。

```env
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRICE_ID_ONE_TIME=price_...
STRIPE_PRICE_ID_MONTHLY_5=price_...
STRIPE_PRICE_ID_MONTHLY_UNLIMITED=price_...
```

5. Webhook:

```bash
cd web
npm run stripe:listen
```

表示された `whsec_...` を `STRIPE_WEBHOOK_SECRET` に入れ、Next.js を再起動する。

決済完了画面だけでは権限は付きません。署名済み Webhook が `PAID` にしてから有料診断が使えます。

キーが無いときはクラッシュせず、「有料診断は現在準備中です」と出ます。そのときは `PAYMENT_PROVIDER=mock` に戻してください。

カードは Stripe のテスト番号（例: `4242 4242 4242 4242`）だけを使います。実カードは使わないでください。

---

## 10. テスト

```bash
cd web
npm test
npm run typecheck
npm run lint
npm run build

# DB とエンジンが起動していること。本機 Chrome
npm run e2e
```

---

## 11. よくあるエラー

| 症状 | 確認 |
| --- | --- |
| Can't reach database server | `npm run db:start`。ポート 55432。二重起動していないか |
| 診断が実行できない | `npm run db:seed` 済みか。`/admin` の「診断エンジン」に件数が出るか |
| 有料ボタンが準備中 | `PAYMENT_PROVIDER=mock` か、Stripe の test キー + Price |
| Mock が 403 | 公開ホスト / `sk_live` / `VERCEL_ENV=production` |
| Stripe listen が認証エラー | `stripe login` が未実施 |
| ポート競合 | 3000 / 55432 |
| E2E が結果画面でタイムアウト | ほぼ DB 停止 |
| 管理画面 404 | `admin@onemake.local` でログイン |

---

## 12. 未確定事項と本番化

- 未確定: [docs/open-questions.md](docs/open-questions.md)
- 本番化時: [docs/production-checklist.md](docs/production-checklist.md)

本番化するときは `PAYMENT_PROVIDER=stripe`、Live キー、クライアント確定の `STRIPE_PRICE_ID`、HTTPS Webhook、`SEED_LOCAL_USERS=false` が必要です。今回はデプロイしません。

---

## 設計文書

- [要件](docs/requirements.md)
- [アーキテクチャ](docs/architecture.md)
- [データベース](docs/database.md)
- [診断ロジック](docs/diagnosis-logic.md)
- [UI 仕様](docs/ui-spec.md)
- [テスト計画](docs/test-plan.md)
- [データ検証](docs/data-validation.md)
- [未確定事項](docs/open-questions.md)
- [本番移行チェックリスト](docs/production-checklist.md)
- [現状資料（動作・構成・進捗）](docs/current-system-status.md)
- [ローカル動作確認レポート](docs/local-completion-report.md)
