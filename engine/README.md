# 診断エンジン（Python 版・アーカイブ）

**このディレクトリは動作中のサービスではありません。** デプロイ対象からも
ローカルの起動手順からも外れています。

## 経緯

当初は FastAPI の独立サービスとして実装していました（指示書 §22）。
Vercel では同一デプロイに常駐プロセスを置けず、別ホストを用意すると
「エンジンが落ちると診断できない」という単一障害点と月額費用が増えるため、
TypeScript へ移植して Next.js に取り込みました。

現在の実装:

| Python（ここ） | TypeScript（現行） |
| --- | --- |
| `app/diagnosis.py` | `web/src/server/engine/calc.ts` |
| `app/dataset.py` | `web/src/server/engine/dataset.ts` |
| `app/main.py`（HTTP 層） | `web/src/lib/engine.ts`（プロセス内呼び出し） |
| `tests/test_diagnosis.py` | `web/tests/engine-calc.test.ts` / `web/tests/engine.test.ts` |

データの読み先も変わりました。Python 版は `data/yield-master.json` を直接
読んでいましたが、現行は PostgreSQL（同じ JSON をシードしたもの）を参照します。

## 残している理由

仕様のリファレンスとして参照できるようにするためです。とくに
`app/diagnosis.py` の丸め（`ROUND_HALF_UP` / `ROUND_DOWN`）と
`tests/test_diagnosis.py` の境界値ケースが、移植の正しさを判断する基準です。

移植版が同じ結果を返すことは `web/tests/engine.test.ts` で、実データ
（`data/yield-master.json`）に対して検証しています。診断ロジックを変更する
ときは、両方の期待値を突き合わせてください。
