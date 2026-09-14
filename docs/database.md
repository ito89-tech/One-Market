# データベース設計

本番はマネージド PostgreSQL、開発は PGlite（PostgreSQL 17 相当）です。
スキーマは共通で、変わるのは `DATABASE_URL` だけです。

実装は `web/prisma/schema.prisma` が正本です。

---

## 1. 設計方針

- 駅名と市区町村は別テーブルにする。1 カラムに混ぜない（指示書 §34）。
- 収益率は「シート × エリア × 築年数区分」の交点に 1 行置く。区分数がシートごとに違っても壊れない。
- 診断結果は実行時点の入力と基準値をスナップショットとして保存する。マスタが更新されても履歴は再現できる。
- 無料診断の利用状態は `User.freeDiagnosisUsedAt` のみを根拠にする。フロントのフラグは信用しない。
- 決済権限は Webhook でサーバー側に反映する。完了画面の表示だけでは付与しない。

---

## 2. ER 概要

```
User 1──* Session
     1──* PropertyDiagnosis
     1──* Payment
     1──* Subscription
     1──* EmailVerification
     1──* TrustedDevice

YieldSheet 1──* Area 1──* Station
                       1──* Municipality
           1──* AgeBracket
           1──* YieldRate   （sheet × area × ageBracket で一意）

Payment 1──* PropertyDiagnosis   （任意。都度課金と診断の紐付け）
StripeEvent                      （Webhook の二重処理防止）
DataIssue                        （.ods 変換時に検出した問題）
```

---

## 3. テーブル

### ユーザー系

| テーブル | 役割 |
| --- | --- |
| `User` | メール・パスワードハッシュ・権限・無料診断利用日時・有料残数・メール確認時刻・Stripe Customer ID |
| `Session` | セッショントークンの HMAC のみ保存。平文は Cookie 側 |
| `EmailVerification` | 登録／他端末ログインの確認リンク。トークンは HMAC のみ |
| `TrustedDevice` | 確認済み端末。ここにある端末からのログインはメール確認を省略 |

`email` は登録時に小文字化して一意制約をかけます。
`role` は `USER` / `ADMIN`。初期管理者は環境変数 `ADMIN_EMAILS` で昇格します。

### 収益率マスタ（`利回りシート .ods` 由来）

| テーブル | 役割 |
| --- | --- |
| `YieldSheet` | 関東 / 関西 / 福岡 / 愛知・その他。`isFallback` がフォールバックシート |
| `Area` | シート内の ①②③④。コードは文字列のまま持ち、①②③ に決め打ちしない |
| `Station` | 駅名。`name` はシート表記、`lookupKey` は末尾「駅」除去などの正規化キー |
| `Municipality` | 市区町村。`kind` は ward / city / town / other（区を市より先に照合するため） |
| `AgeBracket` | `0~1` / `2` … / `35以上`。`ageMax` が null なら上限なし |
| `YieldRate` | レンジ `[lowPercent, highPercent]`。不正セルは `isValid = false` |
| `DataIssue` | BLOCKER / WARNING。値の改変はせず、問題として残す |

駅と市区町村の `@@unique([sheetId, lookupKey])` により、同一シート内の重複は先勝ちで 1 件に集約されます（判定には影響しない重複のみ）。

### 診断

`PropertyDiagnosis` は 1 実行 1 行です。

- 入力: 都道府県・市区町村・駅・徒歩分数・築年数・価格・賃料・管理費・修繕積立金
- ユーザー向け結果: 判定・相場価格帯（万円）・差額（万円）
- 内部（管理画面のみ）: シートキー・エリアコード・照合方法・築年数区分・内部収益率・基準レンジ
- `plan`: `FREE` / `PAID`

徒歩分数はデータに条件が無いため計算には使いません。記録だけ残します。

取得は必ず `where: { id, userId }` です。他ユーザーの ID を指定しても 404 になります。

### 課金

| テーブル | 役割 |
| --- | --- |
| `Payment` | Checkout Session 単位。`PENDING` / `PAID` / `FAILED` / `CANCELED` / `REFUNDED` |
| `Subscription` | Stripe の状態を `ACTIVE` / `TRIALING` / `PAST_DUE` / `CANCELED` / `INCOMPLETE` 等へ写す |
| `StripeEvent` | 処理済みイベント ID。再送での二重付与を防ぐ |

都度課金では `User.paidCredits` を増やします。サブスクでは残数ではなく `ACTIVE` / `TRIALING` を権限の根拠にします。

---

## 4. シード

`web/prisma/seed.ts` が `data/yield-master.json` を読み込み、マスタと `DataIssue` を入れ直します。

```
cd web
npm run db:start    # 初回のみ。以降は常駐
npx prisma db push
npm run db:seed
```

値の補完はしません。`isValid: false` のセルはそのまま入り、診断時に `DATA_UNAVAILABLE` になります。

---

## 5. 将来の更新

収益率やエリアが変わったときは次の 3 手順だけです。アプリケーションコードは書き換えません。

1. `利回りシート .ods` を差し替える
2. `python tools/build_yield_dataset.py` で JSON を再生成する
3. `npm run db:seed` と診断エンジンの再起動

MVP ではマスタ編集 UI は作りません。管理画面は閲覧のみです。
