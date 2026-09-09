# 未確定事項（クライアント確認）

2026-09-09 時点で、ローカル MVP に反映済みの確定仕様と、まだ残っている項目です。

---

## 反映済み（今回の確定仕様）

1. 東京④・築35年以上は最新 xlsx で `4.70%-4.89%`（有効）。旧 ODS の逆転値は使わない。
2. 料金: 1回 1,100円 / 月5回 2,200円 / 無制限 5,500円。
3. 都度課金と月額サブスクをプランごとに併用。
4. 都道府県・市区町村は、駅マスタで一意に決まる場合は入力不要。同名駅・未登録駅のみ fallback。
5. ①以外かつ駅徒歩10分以上は yield range に +0.10%。
6. 相場価格の表示は 1 万円未満切り捨て。

---

## まだ必要なもの

### 本番 Stripe Price ID（Live）

| | |
| --- | --- |
| 状態 | 本番発行待ち |
| 現状 | Test Mode 用 ID を `STRIPE_PRICE_ID_ONE_TIME` / `STRIPE_PRICE_ID_MONTHLY_5` / `STRIPE_PRICE_ID_MONTHLY_UNLIMITED` に入れる |
| 本番 | Live の Price ID を同じ変数名で差し替える。コードへ埋め込まない |

### 駅名の別名辞書

| | |
| --- | --- |
| 状態 | 未提供なら作らない |
| 現状 | 末尾「駅」の有無だけ正規化。勝手に補完しない |

---

ローカルで触ってよいスイッチ:

| 変数 | 意味 |
| --- | --- |
| `PAYMENT_PROVIDER` | `mock` / `stripe` |
| `STRIPE_PRICE_ID_ONE_TIME` | 1,100円 都度 |
| `STRIPE_PRICE_ID_MONTHLY_5` | 2,200円 月額 |
| `STRIPE_PRICE_ID_MONTHLY_UNLIMITED` | 5,500円 月額 |
| `SEED_LOCAL_USERS` | 確認用アカウントの投入 |
