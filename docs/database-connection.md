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
