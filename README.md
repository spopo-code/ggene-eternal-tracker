# ジージェネエターナル 更新チェッカー(MVP)

有志Wiki(atwiki)の公式RSS + 公式X(@ggene_eternal)の投稿を検知し、
静的サイトで通知するミニマムな仕組みです。

- Wiki本文は転載しません(「更新があった」という事実だけを扱う)
- X投稿はX公式のoEmbed機能で埋め込みます(本文の書き起こしはしない)
- 各更新に添える一言コメントはClaude(Anthropic API)による**推測**です。断定ではありません。

## 今日中に公開する手順(GitHub Pages)

1. GitHubで新しいリポジトリを作る(例: `exvs2ib-tracker`)。
2. このフォルダの中身をpushする。

   ```bash
   cd exvs2-tracker
   git init && git add -A && git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/<あなたのユーザー名>/exvs2ib-tracker.git
   git push -u origin main
   ```

3. Settings → Pages → Source を **GitHub Actions** に変更。
4. (任意・後回しでOK) Settings → Secrets and variables → Actions で以下を登録:
   - `ANTHROPIC_API_KEY` … Claude APIキー。未設定でも動く(定型文にフォールバック)。
   - `X_BEARER_TOKEN` … 公式Xの読み取り用。未設定ならX連携だけスキップされ、Wiki監視は通常通り動く。
   - `X_API_KEY` / `X_API_KEY_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` … 自分のXアカウントでツイート投稿するための書き込み用。未設定ならツイート投稿だけスキップされる。
5. Actionsタブから `Check updates and deploy` を手動実行(workflow_dispatch)。
6. 以降は3時間おきに自動実行される。

## X_BEARER_TOKEN の取得手順(あとで追加でOK)

1. https://developer.x.com/ でDeveloperアカウントを作成し、支払い方法を登録
   (2026年時点で無料枠は無く、読み取り従量課金。3時間おき×1アカウント程度なら月あたり数十〜数百円レベル)。
2. Appを作成し、**Bearer Token(App-only)** を発行。
3. GitHubリポジトリの Secrets に `X_BEARER_TOKEN` として登録。

コストが気になる場合は `.github/workflows/check-and-deploy.yml` の
`cron` を `0 */6 * * *`(6時間おき)などに緩めれば読み取り回数を減らせます。

## 自分のXアカウントで自動ツイートするための設定(X_API_KEY等)

Wiki更新を検知したとき、あなたのXアカウントから自動でツイートするための設定。
(初回実行時は過去分がまとめて検知されるだけなので、ツイートは飛びません。2回目以降の本当の新着だけ投稿されます)

1. https://developer.x.com/ でAppを作成(読み取り用のBearer Tokenを取ったのと同じAppでOK)。
2. Appの設定画面 → **User authentication settings** → Edit → **OAuth 1.0a** を有効化し、
   App permissions を **Read and write** に設定して保存。
3. Appの **Keys and tokens** タブを開く:
   - **API Key と API Key Secret** をコピー → GitHub Secretsに `X_API_KEY` / `X_API_KEY_SECRET` として登録
   - **Access Token and Secret** の欄で「Generate」(または再生成) → 発行された
     Access Token / Access Token Secret を `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` として登録
     (手順2で権限をRead and writeにしてから発行しないと、書き込みできないトークンになるので注意)

## ローカルで試す

```bash
npm run check     # Wiki更新チェック → data/updates.json
npm run check-x   # X新着チェック(トークン未設定なら自動スキップ) → data/tweets.json
npm run build     # public/index.html を再生成
```

オフラインでロジックだけ試す場合:

```bash
FIXTURE=./fixtures/sample-rss.xml npm run check
FIXTURE=./fixtures/sample-x-tweets.json npm run check-x
npm run build
```

## 今後の拡張ポイント

- 収益化: `public/index.html` にAdSenseタグやアフィリエイトリンクを追加
- Discord通知: `check-updates.mjs` / `check-x.mjs` の検知ループ内でWebhookにPOSTするだけ
- 他ジャンルへの横展開: `check-updates.mjs` の `RSS_URL` と、`check-x.mjs` の `USERNAME` を
  差し替えれば同じ仕組みを別ジャンルに転用できる
