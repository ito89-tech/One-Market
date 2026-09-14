# デプロイ手順（Vercel + Neon + Stripe 本番）

この文書のとおりに進めれば、ローカルと同じ機能が本番で動きます。
上から順に実行してください。途中で飛ばすと「画面は正常に見えるのに
決済だけ反映されない」といった気付きにくい壊れ方をします。

## 0. 構成

| 役割 | サービス | 備考 |
| --- | --- | --- |
| アプリ | Vercel | Next.js。Root Directory は `web` |
| データベース | Neon | 会員・診断履歴・課金 ＋ 収益率マスタ |
| 決済 | Stripe | ホスト型 Checkout。ウォレットを含む |

接続・自動 migrate / シードの詳細は **`docs/database-connection.md`** を読んでください。
`https://onemarket-kappa.vercel.app/api/health` が `ok: true` になるまで会員機能は使いません。

診断エンジンは Next.js と同じプロセスで動くため、別サービスは要りません。

### 進め方（2段階に分けるのが安全）

Stripe の Webhook 登録には本番ドメインが必要で、ドメインは Vercel の
プロジェクトを作らないと決まりません。そのため、決済を後回しにした
**2段階**で進めるのが確実です。

| 段階 | 入れる環境変数 | 確認できること |
| --- | --- | --- |
| 第1段階 | DB・認証・アプリ URL のみ | 会員登録・ログイン・無料診断 |
| 第2段階 | Stripe 一式を追加 | 有料購入とウォレット決済 |

第1段階では有料導線が「準備中」と表示されます。これは設定不足を検知した
正常な状態で、エラーにはなりません。

Stripe の環境変数は **`STRIPE_SECRET_KEY` と `STRIPE_WEBHOOK_SECRET` を
同時に入れてください**。秘密鍵だけを入れると起動時に失敗します
（決済だけ成立して診断枠が付かない状態を防ぐための意図的な停止です）。

---

## 1. Neon でデータベースを作る

1. [Neon](https://neon.tech) でプロジェクトを作成。リージョンは
   **AWS Tokyo (ap-northeast-1)** を選びます（Vercel の `hnd1` と揃えるため）。
2. 接続文字列を 2 つ控えます。Neon のダッシュボードで
   *Connection string* の **Pooled connection** と **Direct connection** を切り替えると出ます。

```
# アプリ用（ホスト名に -pooler が入る）
DATABASE_URL="postgresql://USER:PASS@ep-xxx-pooler.ap-northeast-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=1"

# マイグレーション用（-pooler なし）
DIRECT_URL="postgresql://USER:PASS@ep-xxx.ap-northeast-1.aws.neon.tech/neondb?sslmode=require"
```

`pgbouncer=true` と `connection_limit=1` はサーバーレス向けの指定です。
Vercel は関数インスタンスごとに接続を張るため、これを付けないと
アクセスが増えたときに Neon の接続上限に達します。

---

## 2. スキーマとマスタデータを投入する

初回だけ手元から本番 DB に対して実行します。
（`.env.production.local` を作ると `.env` を書き換えずに済みます）

```powershell
cd web

# 1) スキーマを作成
$env:DIRECT_URL="<Neon の直結 URL>"
$env:DATABASE_URL="<Neon のプーラー URL>"
npx prisma migrate deploy

# 2) 収益率マスタを投入（本番ではローカル確認用アカウントを作らない）
$env:SEED_LOCAL_USERS="false"
$env:ADMIN_EMAILS="egami09@proton.me"
npx tsx prisma/seed.ts
```

シードは `web/data/yield-sheet.xlsx` を **直接解析して PostgreSQL に書き込みます**（JSON 中間層は使いません）。
診断計算もこの PostgreSQL だけを参照します。

Vercel の `vercel-build` は `scripts/ensure-db-ready.ts` を実行します。

- `DIRECT_URL` が無くても `DATABASE_URL` を流用してマイグレーションする
- 既存スキーマで P3005 が出たら `0_init` を baseline して再試行する
- YieldSheet が 0 件ならバンドル済み xlsx を PostgreSQL へ投入する

さらに実行時 API でも空 DB を検知したら一度だけ自動投入します（`ensureYieldMasterReady`）。
いずれも正本の参照先は PostgreSQL のみです。

デプロイ後の確認用に `GET /api/health` があります（DB 接続・シート数・駅数。シークレットは含みません）。

デプロイ後の再同期・修正は管理画面 **収益率データ**（`/admin/data`）から行えます。

- 「バンドル済み xlsx を PostgreSQL に再反映」… デプロイ同梱の xlsx を Neon へ投入
- xlsx アップロード… 新しい利回りシートを解析して DB 全置換（会員・決済は残る）
- 収益率セル編集 / 駅の追加削除… DB 上の値を管理者が直接修正補充

管理者は次の2通りです。どちらも `role=ADMIN` なら管理画面に入れます。

- **開発者**: 環境変数 `ADMIN_EMAILS`（カンマ区切り）。初期値は `egami09@proton.me`。
  登録時・ログイン時に一覧と一致すれば `ADMIN` に昇格します。
- **実地の管理者**: 管理画面 `/admin/users` の「ユーザーを登録する」で権限を
  「管理者」にして追加します。`ADMIN_EMAILS` に載せる必要はありません。

最後の管理者は削除できません。

> スプレッドシートを更新したときは、管理画面から xlsx をアップロードするか、
> `web/data/yield-sheet.xlsx` を差し替えて再デプロイ／再同期します。
> 同期はマスタ系テーブルのみ入れ替え、会員・診断履歴・課金データは消しません。

### 既に `prisma db push` で作った DB がある場合

`_prisma_migrations` テーブルが無いので `migrate deploy` が失敗します。
一度だけ「適用済み」として記録してください。

```powershell
npx prisma migrate resolve --applied 0_init
```

---

## 3. Stripe を設定する（テスト → 本番）

有料フローは **Test Mode（`sk_test_`）でも本番と同じく動作します**。
サンドボックス検証ではテストキー＋テスト用 Price ID＋テストモード Webhook を入れれば十分で、
`sk_live_` は必須ではありません。公開ホストでは Webhook が無いと有料導線だけ無効になります。

本番課金に切り替えるときは、ダッシュボード右上を **本番環境** にしてから以下を行います。

### 3-1. 商品と価格を作る

3 プランぶんの Price を作成し、ID（`price_...`）を控えます。
通貨は **JPY**、金額は `web/src/config/plans.ts` と揃えてください。

| プラン | 種別 | 金額 |
| --- | --- | --- |
| 1回プラン | 一回限り | 1,100 円 |
| 月5回までプラン | 継続（月次） | 2,200 円 |
| 回数無制限プラン | 継続（月次） | 5,500 円 |

### 3-2. ウォレット決済を有効にする

**設定 → 決済手段** で以下を有効化します。

- Apple Pay
- Google Pay
- Link（任意）

アプリ側は `payment_method_types` を指定していないため、
ここで有効にした決済手段がそのまま Checkout に出ます。
ホスト型 Checkout（`checkout.stripe.com`）を使うので、
**Apple Pay のドメイン登録は不要**です。

> 逆に言うと、`src/app/api/stripe/checkout/route.ts` に
> `payment_method_types: ["card"]` を足すとウォレットが消えます。追加しないこと。

### 3-3. Webhook を登録する

**開発者 → Webhook → エンドポイントを追加**

- URL: `https://<本番ドメイン>/api/stripe/webhook`
- 送信するイベント:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `checkout.session.expired`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `charge.refunded`

登録後に表示される **署名シークレット（`whsec_...`）** を控えます。

有料の枠を付与する経路は次の2つです（どちらも Checkout Session 単位で冪等）。

1. **Webhook**（主経路）— Stripe から署名付きで届く
2. **成功ページの確認 API**（バックアップ）— `/checkout/success?session_id=…`
   が Stripe から Session を再取得して枠を付与する

Webhook を設定し忘れると、以前は課金だけ成立して診断が使えませんでした。
現在は成功ページ側でも付与できるため、ユーザーは結果画面へ進めます。
それでも Webhook は返金・サブスク更新に必要なので必ず登録してください。

### 3-4. Managed Payments（税コード）について

Stripe アカウントによっては **Managed Payments** が既定で有効になり、
商品に `tax_code` が無いと Checkout セッション作成が失敗します。
本アプリはホスト型 Checkout 作成時に `managed_payments.enabled=false` を付けて
回避しています。ダッシュボード側で Managed Payments を無効にしても構いません。

---

## 4. Vercel に設定する

### 4-0. 404: NOT_FOUND が出ている場合はここを先に

`xxxx.vercel.app` が 404 なら、ほぼ確実に **Root Directory が `web` になっていません**。
手順は `docs/vercel-404-fix.md` にまとめてあります。先に直してから下へ進んでください。
無料プラン（Hobby）で十分です。有料プランは不要です。

### 4-1. プロジェクト作成（まだなら）

- GitHub リポジトリ `ito89-tech/One-Market` を Import
- **Root Directory: `web`**（必須。Edit を押して入力）
- Framework Preset: Next.js（自動判定）
- Build Command: 変更不要

既にプロジェクトがある場合は **Settings → General → Root Directory → `web` → Save** のあと、
**Deployments → ⋯ → Redeploy**（Build Cache は外す）してください。

### 4-2. 環境変数（Production）

| 変数 | 値 |
| --- | --- |
| `DATABASE_URL` | Neon のプーラー URL |
| `DIRECT_URL` | Neon の直結 URL |
| `AUTH_SECRET` | 32文字以上のランダム文字列（後述） |
| `NEXT_PUBLIC_APP_URL` | `https://<本番ドメイン>` |
| `PAYMENT_PROVIDER` | `stripe` |
| `SEED_LOCAL_USERS` | `false` |
| `STRIPE_SECRET_KEY` | 本番は `sk_live_...`／検証は `sk_test_...` 可 |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...`（3-3 で控えたもの。テスト／本番は別） |
| `STRIPE_PRICE_ID_ONE_TIME` | `price_...` |
| `STRIPE_PRICE_ID_MONTHLY_5` | `price_...` |
| `STRIPE_PRICE_ID_MONTHLY_UNLIMITED` | `price_...` |
| `ADMIN_EMAILS` | 開発者の管理者メール（カンマ区切り）。初期: `egami09@proton.me`。実地管理者は管理画面から追加 |

`AUTH_SECRET` の生成:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

ローカルの `.env` の値を流用しないでください。これを変えると
既存セッションは無効になります（本番初回なので影響はありません）。

### 4-3. Preview 環境（任意だが推奨）

Preview には Stripe の **テストキー**（`sk_test_` と対応する Price ID、
テストモードの Webhook）を設定します。本番のキーを入れないこと。

設定漏れは起動時に検出されます。`STRIPE_SECRET_KEY` があるのに
`STRIPE_WEBHOOK_SECRET` が無い、`NEXT_PUBLIC_APP_URL` が https でない、
といった場合はデプロイが起動時に失敗します（`web/src/instrumentation.ts`）。

---

## 5. デプロイ後の確認

順番に確認してください。上が通らないと下は意味がありません。

1. **トップページが表示される** — Vercel のビルドと起動が成功している
2. **`/api/health` が 200** — `database=up` かつ `yieldSheets` / `stations` が 0 より大きい
3. **会員登録 → ログイン** — DB 接続と `AUTH_SECRET` が正しい
4. **管理画面 `/admin`（`ADMIN_EMAILS` の開発者アカウント）**
   - 「診断エンジン」に `sheets` / `stations` の件数が出る → シード済み
   - BLOCKER の警告が無い
   - 「ユーザーを登録する」で権限「管理者」の2人目を作れる
5. **無料診断を1回実行** — 診断エンジンが動き、履歴が保存される
6. **マイページで診断履歴を削除できる** — 無料枠は戻らない
7. **有料プランを購入**（物件入力 → ペイウォール経由）
   - スマートフォンの Safari / Chrome で Apple Pay / Google Pay が出ることを確認
   - 決済後は確認ボタンなしで、入力済み物件の**診断結果画面**へ自動遷移する
   - マイページの履歴にも同じ結果が並ぶ（＝ Webhook で枠が付与され診断が保存されている）
8. **Stripe ダッシュボードの Webhook ログ** — 該当イベントが 200 で成功している
9. **続けて有料診断** — 残り回数が正しく減る

7 で結果に進まず「決済の確認に時間がかかっています」になる場合は、ほぼ Webhook の設定ミスです。
Stripe の Webhook ログに出ているレスポンスを確認してください。

- 503 → `STRIPE_WEBHOOK_SECRET` が未設定
- 400 → 署名シークレットが別環境のもの（テスト用と本番用の取り違え）
- 500 → アプリ側のエラー。Vercel のログを確認

---

## 6. 運用時の注意

- **スキーマを変更したとき**: ローカルで `npm run db:migrate` を実行して
  `prisma/migrations/` に差分を作り、コミットします。本番へはデプロイ時に
  `prisma migrate deploy` が自動適用します。`prisma db push` を本番に使わないこと。
- **マスタデータを更新したとき**: 手順 2 のシードを再実行するか、管理画面
  `/admin/data` から xlsx→PostgreSQL 同期と、収益率・駅マスタの直接編集ができます。
  反映直後にエンジンのシートキャッシュは破棄されます。
- **料金を変更するとき**: Stripe 側で新しい Price を作り、環境変数を差し替えます。
  `web/src/config/plans.ts` の表示金額も合わせて更新してください。
- **返金**: Stripe 側で返金すると `charge.refunded` で Payment が REFUNDED に
  なりますが、付与済みのクレジットは自動では減りません。必要なら手動で調整します。
