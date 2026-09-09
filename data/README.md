# 収益率データ置き場

本番データと確認用データを混ぜないための案内です。値の正本はクライアント提供の xlsx です。

| 役割 | 場所 | 変更してよいか |
| --- | --- | --- |
| 原本 | リポジトリ直下の `利回りシート.xlsx` | **変更しない** |
| 正規化済みマスタ | `data/yield-master.json` | 変換スクリプトでのみ再生成 |
| DB 投入 | `web/prisma/seed.ts` が JSON を読む | ユーザー／決済は消さない |

`tools/build_yield_dataset.py` は並べ替えだけ行い、空欄の補完や異常値の訂正はしません。
不正セルは `issues` と `YieldRate.isValid = false` に残します。
