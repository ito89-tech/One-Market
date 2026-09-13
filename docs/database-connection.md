# PostgreSQL の定義と接続の流れ

ワンマケは **PostgreSQL だけ** を正本とします。xlsx は投入用、JSON はテスト用で、
実行時の診断・会員・駅マスタはすべて DB を見ます。

## 全体像

```
[ローカル開発]
  npm run db:start  →  PGlite (WASM PostgreSQL) :55432
  npm run db:ready  →  migrate deploy +（空なら）xlsx シード
  npm run dev       →  Next.js :3000  ──Prisma──► 127.0.0.1:55432

[本番 Vercel]
  Neon / Vercel Postgres（マネージド）
  vercel-build      →  ensure-db-ready（migrate + 空なら xlsx シード）
  サーバーレス関数  →  Prisma（Neon は WebSocket アダプタ）──► Neon
```

Vercel 上で PostgreSQL プロセスを「自動起動」することはできません。
必ず Neon（または Vercel Storage の Postgres）を 1 つ用意し、接続文字列を
Environment Variables に入れる必要があります。

## 収益率マスタの自動配布（xlsx → PostgreSQL）

正本ファイルはデプロイ同梱の `web/data/yield-sheet.xlsx` です。
**診断計算は PostgreSQL だけを見ます**（リクエストごとに xlsx は読みません）。

| タイミング | 動作 |
| --- | --- |
| `vercel-build` / `npm run db:ready` | migrate 後にマスタが空・不完全なら xlsx を DB へ投入 |
| 初回 API（駅・診断など） | 万一ビルド時に空なら、実行時にも一度だけ自動投入 |
| `YIELD_MASTER_SYNC_ON_DEPLOY=force` | 毎回バンドル xlsx でマスタテーブルを全置換（会員・決済履歴は残る） |

新しい Neon や別ドメインの Vercel プロジェクトでも、DB を接続してデプロイすれば
基礎の収益率データは自動で入ります。

---

## Vercel Storage から Neon を新規作成する（推奨・今後の手順）

ダッシュボードに **Connect to a Database / Install Integration** が出ているときの手順です。

### 1. 正しいプロジェクトか確認

左上のプロジェクト名が、実際に公開している URL のプロジェクトと一致していること。
例: 公開が `onemarket-kappa.vercel.app` なら、そのプロジェクトの Storage で作成する。
別プロジェクト（例: `onemarket`）にだけ DB を付けても、公開側には届きません。

### 2. Neon 統合の設定（いまのダイアログ）

1. **Auth トグルは OFF にする**  
   ワンマケは自前の会員登録／ログイン（`User` + セッション Cookie）を使います。  
   Neon Auth を ON にすると別系統の認証が入り、混乱の元です。
2. プランは **Free** のままで問題ありません（Hobby 向け）。
3. **Continue** を押す。
4. **Confirmation** で接続先プロジェクト・環境（Production / Preview）を確認し、進める。
5. **Database Provisioning** が終わるまで待つ（数十秒〜数分）。

完了すると Storage に Neon ストアが表示され、Environment Variables に概ね次が入ります。

| Vercel が入れる名前（例） | 本アプリでの扱い |
| --- | --- |
| `POSTGRES_PRISMA_URL` / `POSTGRES_URL` | アプリ用（プール）。コードが `DATABASE_URL` に読み替え |
| `POSTGRES_URL_NON_POOLING` | マイグレーション用。コードが `DIRECT_URL` に読み替え |

手動で入れる場合の推奨名も併用できます。

| 手動推奨 | 値 |
| --- | --- |
| `DATABASE_URL` | Neon **Pooled**（ホストに `-pooler`） |
| `DIRECT_URL` | Neon **Direct**（`-pooler` なし） |

### 3. 必須のその他の変数（DB 以外）

Storage 連携だけでは足りません。Settings → Environment Variables で Production に:

- `AUTH_SECRET`（32 文字以上の乱数）
- `NEXT_PUBLIC_APP_URL`（例: `https://onemarket-kappa.vercel.app`）
- `ADMIN_EMAILS=egami09@proton.me`
- `SEED_LOCAL_USERS=false`

### 4. Redeploy

**Deployments → 最新の ⋯ → Redeploy**（Build Cache は外す）。  
ビルド中に `ensure-db-ready` が migrate +（空なら）xlsx シードを実行します。

### 5. 確認

ブラウザで:

`https://<あなたのドメイン>/api/health`

`ok: true` かつ `database: "up"`、`yieldSheets` / `stations` が 0 より大きければ完了です。  
その後に会員登録・ログインを試してください。

### 別ルート: neon.tech で作って手動接続

1. [neon.tech](https://neon.tech) でプロジェクト作成（リージョンはできれば Tokyo）
2. Connection string の Pooled / Direct をコピー
3. Vercel の Environment Variables に `DATABASE_URL` / `DIRECT_URL` として貼る
4. Redeploy → `/api/health` 確認

---

## スキーマはどう作られるか

定義の正本は `web/prisma/schema.prisma` です。

| 環境 | 作成方法 |
| --- | --- |
| ローカル初回 | `npm run setup:local` → `ensure-db-ready` → `prisma migrate deploy` |
| 本番ビルド | `vercel-build` → 同じ `ensure-db-ready` |
| 既存 DB で履歴が無い | P3005 時に `migrate resolve --applied 0_init` を試してから再 deploy |

マスタ（駅・収益率）は `web/data/yield-sheet.xlsx` を解析して
`YieldSheet` / `Station` / `YieldRate` などに書き込みます。JSON 経由はありません。

## 環境変数の解決順

コードは次の別名も `DATABASE_URL` として扱います（Vercel の Neon 連携向け）。

**アプリ用（プール）**

1. `DATABASE_URL`
2. `POSTGRES_PRISMA_URL`
3. `POSTGRES_URL`
4. `NEON_DATABASE_URL`

**マイグレーション用（直結）**

1. `DIRECT_URL`
2. `POSTGRES_URL_NON_POOLING`
3. `DATABASE_URL_UNPOOLED`
4. （無ければプール URL を流用）

Neon ではホスト名に `-pooler` が付く方がアプリ用、付かない方が DDL 用です。
加えて `sslmode=require`・`pgbouncer=true`・`connection_limit=1` を必要に応じて補完し、
一部ランタイムで失敗する `channel_binding=require` は除去します。

## ランタイム接続

`web/src/lib/prisma.ts`

- ローカル PGlite: 通常の Prisma TCP クライアント
- Vercel + Neon: `@prisma/adapter-neon` + `@neondatabase/serverless`（WebSocket）

会員登録・ログイン・駅マスタ・診断はすべてこのクライアント経由です。

## 壊れ方と確認

| 症状 | よくある原因 |
| --- | --- |
| ログイン/登録が 500 | `DATABASE_URL` 未設定、または Neon に届かない |
| `/api/health` が 404 | 古いデプロイ（最新 `main` がその Vercel プロジェクトに未反映） |
| `/api/health` が `missing_url` | 環境変数未設定 or 別名だけ入れてアプリが未対応だった旧版 |
| `database=down` | URL 誤り、直結/プールの取り違え、Neon 休眠直後の失敗 |
| sheets/stations が 0 | migrate は成功したがシード未実行 |

確認 URL: `https://<あなたのドメイン>/api/health`  
シークレットは返りません。`ok: true` になるまで会員機能は使いません。

## onemarket-kappa.vercel.app でやること

1. Vercel プロジェクト **Settings → Environment Variables**
2. 最低限入れるもの:
   - `DATABASE_URL` = Neon **Pooled**（`-pooler`）
   - `DIRECT_URL` = Neon **Direct**（`-pooler` なし）
   - `AUTH_SECRET` = 32 文字以上の乱数
   - `NEXT_PUBLIC_APP_URL` = `https://onemarket-kappa.vercel.app`
   - `ADMIN_EMAILS` = `egami09@proton.me`
   - `SEED_LOCAL_USERS` = `false`
3. Git 連携が `ito89-tech/One-Market` の `main` であること
4. **Root Directory = `web`**
5. Redeploy（Build Cache なし推奨）
6. `/api/health` が 200 / `ok: true` を確認してからログイン

Storage で Neon を「Connect」した場合は `POSTGRES_PRISMA_URL` 等が自動注入されます。
現行コードはそれを `DATABASE_URL` に読み替えます。
