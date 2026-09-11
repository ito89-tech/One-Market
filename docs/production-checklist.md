# 本番移行チェックリスト

実際の手順は `docs/deployment.md` にあります。この文書は「漏れがないか」を
確認するための一覧です。移行は `Local → Preview → Production` の順で進めます。

---

## 1. インフラ

- [ ] マネージド PostgreSQL（Neon。バックアップとリージョンを確認）
- [ ] Vercel プロジェクト（Root Directory = `web`）とカスタムドメイン
- [ ] HTTPS（アプリ・Webhook とも）
- [ ] Preview 環境を本番と同じ構成で 1 式（Stripe はテストキー）

診断エンジンは Next.js と同一プロセスで動くため、別ホストは不要です。

## 2. データベース

- [ ] `DATABASE_URL` を Neon の**プーラー**接続に設定
- [ ] `DIRECT_URL` を Neon の**直結**接続に設定（マイグレーション用）
- [ ] `npx prisma migrate deploy` を本番に適用
      （`prisma db push` で作った既存 DB なら `migrate resolve --applied 0_init` を一度だけ）
- [ ] `npm run db:seed` で収益率マスタを投入（ユーザーデータは消さない）
- [ ] `SEED_LOCAL_USERS=false`（`admin@onemake.local` を本番に作らない）
- [ ] バックアップ取得手順とリストア試験

## 3. シークレット

Git に入れない。Vercel の環境変数へ。

- [ ] `AUTH_SECRET`（32 文字以上の乱数。開発値を使わない）
- [ ] `NEXT_PUBLIC_APP_URL`（`https://` の本番ドメイン）
- [ ] `ADMIN_EMAILS`（実在する運用者のみ）

致命的な設定漏れは起動時に検出され、デプロイが失敗します
（`web/src/instrumentation.ts`）。警告はビルドログに出ます。

## 4. Stripe

- [ ] `PAYMENT_PROVIDER=stripe`（**mock にしない**）
- [ ] Stripe **Live** の `STRIPE_SECRET_KEY`（`sk_live_...`）
- [ ] `STRIPE_PRICE_ID_ONE_TIME` / `STRIPE_PRICE_ID_MONTHLY_5` /
      `STRIPE_PRICE_ID_MONTHLY_UNLIMITED`（本番モードで作成した Price）
- [ ] 表示金額（`web/src/config/plans.ts`）と Stripe 側の金額が一致
- [ ] **ウォレット決済**（Apple Pay / Google Pay）をダッシュボードで有効化
- [ ] Webhook エンドポイント `https://<本番>/api/stripe/webhook`
- [ ] `STRIPE_WEBHOOK_SECRET`（`whsec_...`。これが無いと枠が付与されない）
- [ ] Webhook の対象イベントが `docs/deployment.md` §3-3 と一致
- [ ] Preview は Test Mode のキーと Price を使う

Mock Payment は次のいずれかで無効になります。

- `PAYMENT_PROVIDER` が `mock` 以外
- `NEXT_PUBLIC_APP_URL` のホストが localhost / 127.0.0.1 以外
- `VERCEL_ENV=production`
- `STRIPE_SECRET_KEY` が `sk_live` で始まる

## 5. データ

- [ ] `.ods` / `.xlsx` は変更しない運用を続ける（変換スクリプトだけを回す）
- [ ] 更新時は `python tools/build_yield_dataset.py` → `npm run db:seed`
- [ ] 管理画面に BLOCKER の警告が出ていないこと

## 6. 監視・運用

- [ ] アプリと DB のヘルスチェック（`/admin` の「診断エンジン」に件数が出る）
- [ ] エラーログ（パスワード・Stripe Secret・Cookie・トークン・個人情報を出さない）
- [ ] Stripe ダッシュボードの失敗 Webhook 監視
- [ ] DB のバックアップ成功通知
- [ ] アップタイム監視（外形監視で LP と `/api` の死活）
- [ ] トランザクションメール（パスワード再設定は MVP スコープ外。必要なら後続）
- [ ] 管理者は実在メールのみ。シードの `*.onemake.local` を残さない

## 7. 最終確認

- [ ] 本番で LP → 入力 → 登録 → 無料診断 → 有料購入 → 再診断
- [ ] スマートフォンで Apple Pay / Google Pay が表示される
- [ ] 購入後にマイページの残り回数が増える（＝ Webhook が届いている）
- [ ] 一般ユーザーが `/admin` で 404 になること
- [ ] 他人の診断 URL が 404 になること
- [ ] `PAYMENT_PROVIDER=mock` が Preview／本番の環境変数に残っていないこと
