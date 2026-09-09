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
   └─ サーバー内部からのみ 診断エンジンを呼ぶ
          │  HTTP (localhost / 内部ネットワーク)
          ▼
   FastAPI (Python 3.12)              [engine/]
   └─ 純粋な診断ロジック。DB もセッションも持たない
          ▲
          │  起動時にロード
   data/yield-master.json（.ods から生成）
```

### なぜこの分割か

- 指示書 §22 が Frontend = Next.js / Backend・Diagnosis = Python を指定している。
- 診断エンジンを **状態を持たない純粋な計算サービス** にすることで、
  収益率データが変わっても再デプロイだけで済み、単体テストが容易になる（§21・§36）。
- 認証・課金・権限判定は Next.js 側に集約する。エンジンは外部公開しない。
- エンジンが落ちていても LP と会員機能は動作する（診断のみ 503 を返す）。

## 2. データの流れ

```
利回りシート .ods
      │ tools/build_yield_dataset.py   ← 値の補完はしない。異常は issues に記録
      ▼
data/yield-master.json                 ← 唯一の正規化済みマスタ
      ├─ web/prisma/seed.ts   → PostgreSQL（画面表示・管理画面・駅名補完用）
      └─ engine 起動時ロード  → 診断計算用
```

DB とエンジンが同じ JSON を出所とするため、表示と計算がずれません。
データを更新するときは `.ods` を差し替えて変換 → シード → エンジン再起動、の 3 手順のみです。

## 3. ディレクトリ

```
One-Market/
├─ 利回りシート .ods          クライアント提供の原本（変更しない）
├─ data/yield-master.json     変換済みマスタ（生成物・コミット対象）
├─ tools/                     .ods 解析・変換スクリプト（Python）
├─ docs/                      設計文書
├─ engine/                    FastAPI 診断エンジン
│  ├─ app/
│  │  ├─ main.py              HTTP 層のみ
│  │  ├─ schemas.py           入出力の型
│  │  ├─ dataset.py           マスタの読み込みと索引
│  │  └─ diagnosis.py         診断ロジック（純粋関数）
│  └─ tests/
└─ web/                       Next.js
   ├─ prisma/schema.prisma
   ├─ prisma/seed.ts
   ├─ scripts/pg.ts           埋め込み PostgreSQL 起動/停止
   └─ src/
      ├─ app/                 画面と Route Handlers
      ├─ components/          UI 部品
      ├─ lib/                 認証・DB・Stripe・検証・エンジンクライアント
      └─ server/              サーバー専用のユースケース層
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
| `DATABASE_URL` | PostgreSQL 接続文字列 |
| `AUTH_SECRET` | セッショントークンのハッシュ用ソルト |
| `DIAGNOSIS_ENGINE_URL` | Python エンジンのベース URL |
| `STRIPE_SECRET_KEY` | Stripe 秘密鍵（サーバーのみ） |
| `STRIPE_WEBHOOK_SECRET` | Webhook 署名シークレット |
| `STRIPE_PRICE_ID` | 有料診断の価格 ID（未確定。空なら Stripe 導線は無効） |
| `STRIPE_MODE` | `payment` または `subscription` |
| `PAYMENT_PROVIDER` | `mock`（localhost のみ）または `stripe` |
| `SEED_LOCAL_USERS` | ローカル確認用アカウントの投入 |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | 公開鍵（クライアント可） |
| `NEXT_PUBLIC_APP_URL` | リダイレクト URL の組み立て |
| `ADMIN_EMAILS` | 起動時に管理者へ昇格させるメールアドレス（カンマ区切り） |

## 8. デプロイ方針

MVP の運用コストと保守性を優先し、次を想定します。

- Next.js: Vercel（または Node が動く任意の PaaS）
- FastAPI: Render / Cloud Run など。**外部からのアクセスを閉じ、Next.js からのみ到達可能にする**
- PostgreSQL: Neon / Supabase / RDS などのマネージド
- ローカル開発: PGlite（`npm run db:start`）。本番はマネージド PostgreSQL で `DATABASE_URL` だけ差し替える
