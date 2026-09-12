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
$env:ADMIN_EMAILS="<管理者にするメールアドレス>"
npx tsx prisma/seed.ts
```

シードは `web/data/yield-master.json`（無ければリポジトリ直下の `data/yield-master.json`）を読みます。
Vercel の Root Directory は `web/` のため、本番ランタイム用のマスタは `web/data/` にバンドルしています。

デプロイ後の再同期は管理画面 **収益率データ** から行えます。

- 「バンドル済みマスタをDBに再反映」… デプロイに含まれる JSON を Neon へ投入
- JSON アップロード… 手元で `python tools/build_yield_dataset.py` した出力（Vercel でも確実）
- xlsx アップロード… ローカルで Python が使えるときのみ自動変換。Vercel では JSON 推奨

> スプレッドシートを更新したときは、変換 → シード再実行、または管理画面から同期します。
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

有料の枠を付与するのはこの Webhook だけです。決済完了画面に到達したことは
根拠になりません。ここを設定し忘れると、課金は成立するのに診断が使えません。

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
| `ADMIN_EMAILS` | 管理画面に入れるメールアドレス |

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
2. **会員登録 → ログイン** — DB 接続と `AUTH_SECRET` が正しい
3. **管理画面 `/admin`（`ADMIN_EMAILS` のアカウント）**
   - 「診断エンジン」に `sheets` / `stations` の件数が出る → シード済み
   - BLOCKER の警告が無い
4. **無料診断を1回実行** — 診断エンジンが動き、履歴が保存される
5. **有料プランを購入**
   - スマートフォンの Safari / Chrome で Apple Pay / Google Pay が出ることを確認
   - 決済後、マイページに残り回数が反映される（＝ Webhook が届いている）
6. **Stripe ダッシュボードの Webhook ログ** — 該当イベントが 200 で成功している
7. **2回目の有料診断** — 残り回数が正しく減る

5 で残り回数が増えない場合は、ほぼ Webhook の設定ミスです。
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
  `/admin/data` からバンドル JSON の再反映／JSON アップロードを行います。
  反映直後にエンジンのシートキャッシュは破棄されます。
- **料金を変更するとき**: Stripe 側で新しい Price を作り、環境変数を差し替えます。
  `web/src/config/plans.ts` の表示金額も合わせて更新してください。
- **返金**: Stripe 側で返金すると `charge.refunded` で Payment が REFUNDED に
  なりますが、付与済みのクレジットは自動では減りません。必要なら手動で調整します。
