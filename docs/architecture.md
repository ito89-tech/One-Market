# アーキテクチャ

## 1. 全体構成

```
ブラウザ
   │  HTTPS / httpOnly Cookie セッション
   ▼
Next.js 16 (App Router, TypeScript)   [web/]
   ├─ 画面（Server Components 中心）
   ├─ Route Handlers = 公開 API（認証・入力検証・権限判定）
   ├─ Prisma → PostgreSQL
   └─ 診断エンジン（同一プロセス内）  [web/src/server/engine/]
      ├─ calc.ts     診断ロジック（純粋関数・Decimal 演算）
      └─ dataset.ts  基準データの参照（PostgreSQL のみ）
          │
          ▼
   PostgreSQL（マネージド。ローカルは埋め込み PGlite）
   └─ 会員・診断履歴・課金 ＋ 収益率マスタ
```

### なぜこの構成か

- 診断ロジックは **状態を持たない純粋関数**。データは引数で渡すので単体テストが容易（§21・§36）。
- 基準データの参照先を PostgreSQL に一本化してあるため、
  画面表示・管理画面・診断計算が同じ数字を見る。ずれようがない。
- 認証・課金・権限判定も Next.js 側。外部に開くサービスは Next.js だけ。
- 常駐プロセスが Next.js だけなので、Vercel の 1 デプロイで完結する。

> 当初は Python(FastAPI) の別サービスとして実装していました（指示書 §22）。
> Vercel では同一デプロイに常駐プロセスを置けず、別ホストを用意すると
> 「エンジン停止＝診断不能」という単一障害点と月額費用が増えるため、
> TypeScript へ移植して取り込みました。移植前の実装とテストは `engine/` に
> 仕様のリファレンスとして残しています（デプロイ対象ではありません）。
> 境界値を含む仕様ケースは `web/tests/engine.test.ts` に移植済みで、
> 実データ（data/yield-master.json）に対して同じ結果になることを検証しています。

## 2. データの流れ

```
利回りシート .ods
      │ tools/build_yield_dataset.py   ← 値の補完はしない。異常は issues に記録
      ▼
data/yield-master.json                 ← 唯一の正規化済みマスタ
      └─ web/prisma/seed.ts   → PostgreSQL
                                 （画面表示・管理画面・駅名補完・診断計算すべて）
```

表示も計算も同じテーブルを読むため、両者がずれることはありません。
データを更新するときは `.ods` を差し替えて変換 → シード、の 2 手順です。

## 3. ディレクトリ

```
One-Market/
├─ 利回りシート .ods          クライアント提供の原本（変更しない）
├─ data/yield-master.json     変換済みマスタ（生成物・コミット対象）
├─ tools/                     .ods 解析・変換スクリプト（Python）
├─ docs/                      設計文書
├─ engine/                    移植前の FastAPI 実装（仕様リファレンス／非デプロイ）
└─ web/                       Next.js
   ├─ prisma/schema.prisma
   ├─ prisma/migrations/      スキーマ変更履歴（本番は migrate deploy で適用）
   ├─ prisma/seed.ts
   ├─ scripts/pg.ts           埋め込み PostgreSQL 起動/停止
   └─ src/
      ├─ app/                 画面と Route Handlers
      ├─ components/          UI 部品
      ├─ lib/                 認証・DB・Stripe・検証・診断エンジンの入口
      └─ server/              サーバー専用のユースケース層
         └─ engine/           診断ロジックと基準データ参照
```

## 4. API

レスポンス形式は成功・失敗のどちらも統一します。

```jsonc
// 成功
{ "ok": true, "data": { ... } }
// 失敗
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "入力内容をご確認ください", "details": { "price": "0 以上で入力してください" } } }
```

| メソッド | パス | 認証 | 用途 |
| --- | --- | --- | --- |
| POST | `/api/diagnosis/preview` | 不要 | 入力内容の検証のみ。診断結果は返さない |
| POST | `/api/diagnosis` | 必要 | 診断を実行して保存。無料枠 / 有料枠を消費 |
| GET | `/api/diagnosis/:id` | 必要 | 自分の診断結果のみ取得 |
| POST | `/api/auth/register` | 不要 | 会員登録 |
| POST | `/api/auth/login` | 不要 | ログイン |
| POST | `/api/auth/logout` | 必要 | ログアウト |
| GET | `/api/me` | 必要 | アカウント情報と利用状況 |
| GET | `/api/master/stations` | 不要 | 駅名の入力補完 |
| GET | `/api/master/municipalities` | 不要 | 市区町村の入力補完 |
| POST | `/api/stripe/checkout` | 必要 | Checkout セッション作成。mock 時は `/checkout/mock` |
| POST | `/api/stripe/webhook` | 署名 | 決済状態の反映 |
| POST | `/api/payments/mock/complete` | 必要 | ローカル専用。本番では 403 |
| GET | `/api/admin/*` | 管理者 | 管理画面用の参照 API |

エンジン側（外部非公開）:

| メソッド | パス | 用途 |
| --- | --- | --- |
| GET | `/health` | 死活と読み込み件数 |
| POST | `/diagnose` | 診断計算 |
| GET | `/dataset/issues` | データ検証結果 |

## 5. 認証

**方式: DB に保存する不透明セッショントークン + httpOnly Cookie**

JWT を使わないのは、失効を即座に反映したい（無料枠・権限がサーバー状態に依存する）ためです。

- ログイン成功時に 32 バイトの乱数を生成し、**SHA-256 ハッシュのみ** を `Session` に保存する。
  平文はレスポンスの Cookie にしか存在しない（DB 流出時にセッションを再現できない）。
- Cookie: `httpOnly`, `sameSite=lax`, `secure`（本番）, `path=/`, 有効期限 30 日。
- パスワードは bcrypt（cost 12）。
- CSRF: 状態を変える API は `sameSite=lax` に加えて **Origin ヘッダ検証** を行う。

## 6. セキュリティ対応表

| 項目 | 対応 |
| --- | --- |
| パスワード保護 | bcrypt cost 12。ハッシュは API レスポンスに含めない |
| セッション管理 | 不透明トークン、DB でハッシュ保管、失効・期限あり |
| CSRF | SameSite=Lax + Origin 検証 |
| XSS | React の自動エスケープ。`dangerouslySetInnerHTML` を使わない |
| SQL Injection | Prisma のパラメータ化クエリのみ。生 SQL を使わない |
| API 認証 | セッションからユーザーを解決できない場合は 401 |
| 権限確認 | 診断・決済の取得は必ず `where: { userId: session.userId }` を伴う |
| Stripe Secret 保護 | サーバー専用環境変数。`NEXT_PUBLIC_` を付けない |
| Webhook 署名検証 | `stripe.webhooks.constructEvent` で検証。生ボディを使用 |
| ユーザー間データ分離 | 上記の権限確認 + E2E で他ユーザー ID へのアクセスを検証 |
| 入力値検証 | Zod スキーマをクライアント / サーバーで共有。サーバー側を正とする |
| 情報の出し分け | 内部利回り・エリアコードは API の公開レスポンスに含めない |

## 7. 環境変数

`.env.example` を参照。`.env` はコミットしません。

| 変数 | 用途 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 接続文字列（本番はプーラー経由） |
| `DIRECT_URL` | マイグレーション用の直結。プーラーでは DDL を流せないため分ける |
| `AUTH_SECRET` | セッショントークンのハッシュ用ソルト |
| `STRIPE_SECRET_KEY` | Stripe 秘密鍵（サーバーのみ） |
| `STRIPE_WEBHOOK_SECRET` | Webhook 署名シークレット。**未設定だと決済しても枠が付かない** |
| `STRIPE_PRICE_ID_ONE_TIME` | 1回プランの Price ID |
| `STRIPE_PRICE_ID_MONTHLY_5` | 月5回プランの Price ID |
| `STRIPE_PRICE_ID_MONTHLY_UNLIMITED` | 無制限プランの Price ID |
| `PAYMENT_PROVIDER` | `mock`（localhost のみ）または `stripe` |
| `SEED_LOCAL_USERS` | ローカル確認用アカウントの投入。本番は `false` |
| `NEXT_PUBLIC_APP_URL` | リダイレクト URL の組み立てと CSRF 判定 |
| `ADMIN_EMAILS` | 起動時に管理者へ昇格させるメールアドレス（カンマ区切り） |

設定漏れは `web/src/instrumentation.ts` が起動時に検査します。
`STRIPE_WEBHOOK_SECRET` 欠落などの致命的な組み合わせでは起動を止めます。

## 8. デプロイ方針

- Next.js: Vercel（Root Directory = `web`、リージョン `hnd1`）
- PostgreSQL: Neon（マネージド）。アプリはプーラー経由、マイグレーションは直結
- 診断エンジン: Next.js と同一プロセス。別ホストは不要
- ローカル開発: PGlite（`npm run db:start`）。接続文字列を差し替えるだけで本番と同じ経路

手順の詳細は `docs/deployment.md` を参照してください。
