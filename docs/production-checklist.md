# 本番移行チェックリスト

今回の作業対象はローカル MVP です。本番デプロイは含みません。
移行は `Local → Staging → Production` の順を推奨します。

---

## 1. インフラ

- [ ] マネージド PostgreSQL（バックアップ・メンテナンスウィンドウを含む）
- [ ] Next.js のホスト（Vercel 等）とカスタムドメイン
- [ ] 診断エンジン（FastAPI）を内部ネットワークで起動。公開しない
- [ ] HTTPS（アプリ・Webhook とも）
- [ ] ステージング環境を本番と同じ構成で 1 式用意する

## 2. データベース

- [ ] `DATABASE_URL` を本番 PostgreSQL に差し替える
- [ ] 開発用の `pgbouncer=true&connection_limit=1` を外す
  （PgBouncer をトランザクションモードで使う場合のみ `pgbouncer=true` を付け直す）
- [ ] `npx prisma db push` またはマイグレーションを本番に適用
- [ ] `npm run db:seed` で収益率マスタを投入（ユーザーデータは消さない）
- [ ] `SEED_LOCAL_USERS=false`（`admin@onemake.local` を本番に作らない）
- [ ] バックアップ取得手順とリストア試験

## 3. シークレット

Git に入れない。ホストの環境変数またはシークレットマネージャへ。

- [ ] `AUTH_SECRET`（32 バイト以上の乱数。開発値を使わない）
- [ ] `DIAGNOSIS_ENGINE_URL`（内部 URL）
- [ ] `NEXT_PUBLIC_APP_URL`（`https://` の本番ドメイン）
- [ ] `ADMIN_EMAILS`（実在する運用者のみ）

## 4. Stripe（本番仕様が確定してから）

`docs/open-questions.md` の料金・課金方式・Price ID が揃ってから実施。

- [ ] `PAYMENT_PROVIDER=stripe`（**mock にしない**）
- [ ] Stripe **Live** の `STRIPE_SECRET_KEY`（`sk_live_...`）
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`（`pk_live_...`）
- [ ] `STRIPE_PRICE_ID`（クライアント確定値。`LOCAL_TEST_PRICE_ID` は使わない）
- [ ] `STRIPE_MODE`（`payment` または `subscription`）
- [ ] `STRIPE_CREDITS_PER_PURCHASE`（都度課金のとき）
- [ ] Webhook エンドポイント `https://<本番>/api/stripe/webhook`
- [ ] `STRIPE_WEBHOOK_SECRET`（`whsec_...`。署名検証必須）
- [ ] ステージングは Test Mode のキーと Price を使う

Mock Payment は次のいずれかで無効になります。

- `PAYMENT_PROVIDER` が `mock` 以外
- `NEXT_PUBLIC_APP_URL` のホストが localhost / 127.0.0.1 以外
- `VERCEL_ENV=production`
- `STRIPE_SECRET_KEY` が `sk_live` で始まる

## 5. データ

- [ ] 東京④・築35年以上の正しい収益率をシートで受領し、`.ods` を差し替えて再変換
- [ ] `python tools/build_yield_dataset.py` → `npm run db:seed` → エンジン再起動
- [ ] `.ods` は変更しない運用を続ける（変換スクリプトだけを回す）

## 6. 監視・運用

- [ ] アプリ / エンジン / DB のヘルスチェック
- [ ] エラーログ（パスワード・Stripe Secret・Cookie・トークン・個人情報を出さない）
- [ ] Stripe ダッシュボードの失敗 Webhook 監視
- [ ] ディスクと DB のバックアップ成功通知
- [ ] アップタイム監視（外形監視で LP と `/api` の死活）
- [ ] ドメインと HTTPS（Webhook も HTTPS）
- [ ] トランザクションメール（パスワード再設定は MVP スコープ外。必要なら後続）
- [ ] 管理者は実在メールのみ。シードの `*.onemake.local` を残さない

## 7. 最終確認

- [ ] ステージングで LP → 入力 → 登録 → 無料診断 → 有料（Test Mode）→ 再診断
- [ ] 一般ユーザーが `/admin` で 404 になること
- [ ] 他人の診断 URL が 404 になること
- [ ] `PAYMENT_PROVIDER=mock` がステージング／本番の環境変数に残っていないこと
