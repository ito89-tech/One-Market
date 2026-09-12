# Vercel で 404 が出るとき（無料プラン向け）

`https://xxxx.vercel.app` が **404: NOT_FOUND** になる典型原因は次の2つです。

1. **Root Directory が空のまま**（このリポジトリでは最重要）
2. **ビルドが Failed** で、成功したデプロイが1つもない

このリポジトリはモノレポです。Next.js アプリはルートではなく **`web/`** の中にあります。
Root Directory を直さないと、Vercel は正しいアプリをビルドできず、URL が 404 になります。

無料プラン（Hobby）でも問題なく動きます。有料プランは不要です。

---

## 直しかた（画面操作・約3分）

### 1. Root Directory を `web` にする

1. [vercel.com/dashboard](https://vercel.com/dashboard) を開く
2. プロジェクト（例: `one-market-three`）を開く
3. 上のタブ **Settings**
4. 左メニュー **General**
5. **Root Directory** の右にある **Edit**
6. 入力欄に次を入れる（前後にスペースを入れない）

```text
web
```

7. **Include source files outside of the Root Directory in the Build Step** は
   **オン（チェック）** にする  
   （シード用の `data/yield-master.json` がリポジトリルートにあるため）
8. **Save**

### 2. 環境変数を入れる（まだなら）

同じ **Settings → Environment Variables** に、最低限これを Production 向けに追加します。

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Neon のプーラー接続（`&pgbouncer=true&connection_limit=1` 付き） |
| `DIRECT_URL` | Neon の直結接続 |
| `AUTH_SECRET` | 32文字以上の乱数 |
| `NEXT_PUBLIC_APP_URL` | `https://one-market-three.vercel.app`（自分のURL） |
| `PAYMENT_PROVIDER` | `stripe` |
| `SEED_LOCAL_USERS` | `false` |

`AUTH_SECRET` の作り方（自分のPCの PowerShell）:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Neon の作り方と接続文字列の詳細は `docs/deployment.md` を見てください。
DB がまだ無い状態でもビルド自体は通るようにしてありますが、**会員登録や診断は DB 無しでは動きません**。

### 3. 再デプロイする

環境変数や Root Directory を変えただけでは反映されません。

1. 上のタブ **Deployments**
2. いちばん上のデプロイの右端 **⋯**
3. **Redeploy**
4. **Use existing Build Cache** のチェックは **外す**
5. **Redeploy** を押す

数分待つと、ステータスが **Ready**（緑）になります。
そのあと `https://one-market-three.vercel.app` を開き直してください（強制更新: Ctrl+Shift+R）。

### 4. まだ失敗する場合

**Deployments** で赤い **Failed** をクリック → **Building** のログを開く。

| ログに出る文言 | やること |
| --- | --- |
| `Couldn't find any pages` / Next.js が見つからない | Root Directory が `web` になっていない |
| `Environment variable not found: DATABASE_URL` | Environment Variables を入れて Redeploy |
| `P1001` / Can't reach database | Neon の接続文字列・リージョン・パスワードを確認 |
| `AUTH_SECRET` | `AUTH_SECRET` を追加して Redeploy |

---

## GitHub 連携の確認

1. **Settings → Git**
2. Connected Git Repository が `ito89-tech/One-Market` になっていること
3. Production Branch が `main` になっていること

以降は `git push origin main` するたびに自動で再デプロイされます。

---

## 成功したあとに必ずやること

ビルドが Ready になっても、**収益率マスタのシード**は手元から1回実行する必要があります。

```powershell
cd d:\project_resume\One-Market\web
$env:DATABASE_URL="<Neon プーラー>"
$env:DIRECT_URL="<Neon 直結>"
$env:SEED_LOCAL_USERS="false"
npx prisma migrate deploy
npx tsx prisma/seed.ts
```

詳細な本番手順（Stripe 含む）は `docs/deployment.md` です。
