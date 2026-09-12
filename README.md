# ジージェネエターナル 更新チェッカー

「SDガンダム ジージェネレーション エターナル」の関連情報を、複数の合法的な情報源から
自動で検知・集計し、静的サイトとして公開し続ける仕組みです。24時間365日、
人が操作しなくても裏で動き続けることを目標にしています。

## 情報源と設計方針(何をやって、何をやらないか)

| 情報源 | 何をするか | 著作権・規約への配慮 |
|---|---|---|
| 有志Wiki(atwiki) | 更新情報RSSで「更新があった」事実だけ検知 | 本文は転載しない(著作権は当該Wikiに帰属) |
| 公式X(@ggene_eternal) | (任意・有料)投稿を検知して埋め込み表示 | 本文はX公式oEmbedでそのまま埋め込み、改変しない |
| YouTube検索 | 「ジージェネエターナル」で横断検索し、実況者・攻略勢の動画も検知 | 動画本文はYouTube公式oEmbedで埋め込むのみ |
| (自分の)X投稿 | 新着検知時に一言コメント付きで自動ツイート | 自分のアカウントからの発信なので問題なし |

**意図的にやらないこと:**
- 5ch/2ch系まとめサイトの構築(投稿の著作権・規約上のリスクが高いため)
- 個人ツイートを大量に集めて記事化すること(同上の理由)
- ゲームクライアントの自動操作・周回代行(利用規約のBOT禁止条項に抵触するため)

## サイトに表示される4つの要素

1. **今週の傾向** — 直近7日間の検知動画「本数」「投稿チャンネル数」はコード側の機械集計による実数。AIはその実数をもとに文章化するだけで、数字自体を創作することはない
2. **蓄積データからの統計**(AI不使用) — Wiki更新やガシャ関連更新の平均間隔、直近8週間の動画検知数の推移。データが溜まるほど精度が上がる、時間そのものが資産になる部分
3. **タイムライン** — Wiki更新・X投稿・YouTube動画を時系列で並べたフィード
4. 各項目に添えられる一言コメント(Claudeによる推測。断定ではない)

## セットアップ手順(GitHub Pages)

1. GitHubで新しいリポジトリを作り、このフォルダの中身をpushする。

   ```bash
   git init && git add -A && git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/<ユーザー名>/<リポジトリ名>.git
   git push -u origin main
   ```

2. Settings → Pages → Source を **GitHub Actions** に変更。
3. Settings → Secrets and variables → Actions で必要な分を登録(詳細は下記)。
4. Actionsタブから `Check updates and deploy` を手動実行(workflow_dispatch)。
5. 以降は3時間おきに自動実行される。

### 登録できるSecrets一覧

| Secret名 | 用途 | 必須? | 費用 |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | 各種コメント文の生成 | 任意(無ければ定型文にフォールバック) | 従量課金(少額) |
| `YOUTUBE_API_KEY` | YouTube検索 | 任意だが強く推奨 | **無料** |
| `X_BEARER_TOKEN` | 公式X投稿の読み取り | 任意 | 有料(従量課金) |
| `X_API_KEY` / `X_API_KEY_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | 自分のXアカウントでの自動ツイート | 任意 | 無料(投稿APIは無料枠あり) |

どれも未設定なら該当機能だけが安全にスキップされ、他の部分は通常通り動く。

#### YOUTUBE_API_KEY の取得(完全無料・支払い登録不要)

1. https://console.cloud.google.com/ でプロジェクトを作成
2. 「APIとサービス」→「ライブラリ」→ **YouTube Data API v3** を有効化
3. 「認証情報」→「認証情報を作成」→ **APIキー** を発行してコピー
4. GitHub Secretsに `YOUTUBE_API_KEY` として登録

無料枠は1日10,000ユニット。検索1回100ユニットなので1日数回のチェックなら十分。

#### X_BEARER_TOKEN の取得(有料)

1. https://developer.x.com/ でDeveloperアカウント登録・支払い方法登録
2. Appを作成し **Bearer Token** を発行 → `X_BEARER_TOKEN` として登録

#### X_API_KEY等(自動ツイート用)の取得

1. 同じAppの **User authentication settings** → OAuth 1.0a を有効化し、
   App permissions を **Read and write** に設定
2. **Keys and tokens** タブで API Key/Secret、Access Token/Secret を発行
   (Read and writeにしてから発行しないと書き込めないトークンになるので注意)
3. それぞれ `X_API_KEY` / `X_API_KEY_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` として登録

初回実行時は過去分が一括検知されるだけなのでツイートは飛ばない。2回目以降の
本当の新着のときだけ投稿される。

## ローカルで試す

```bash
npm run check          # Wiki更新チェック
npm run check-x        # X新着チェック(トークン未設定なら自動スキップ)
npm run check-youtube  # YouTube新着チェック(キー未設定なら自動スキップ)
npm run weekly-trend   # 週次トレンド集計(週1回だけ生成、重複なし)
npm run history-stats  # 蓄積データからの統計を再計算
npm run build          # public/index.html を再生成
npm run run-all        # 上記を全部まとめて実行
```

オフラインでロジックだけ試す場合は `FIXTURE=<パス>` を付けて実行する
(各fixturesファイルを参照)。

## ファイル構成

```
scripts/
  check-updates.mjs   … Wiki更新検知 + 自動ツイート
  check-x.mjs         … 公式X読み取り
  check-youtube.mjs   … YouTube横断検索 + 自動ツイート
  weekly-trend.mjs    … 週次トレンド集計(実数ベース)
  history-stats.mjs   … 蓄積データの統計分析(AI不使用)
  build-site.mjs      … 上記全部を1つの静的サイトに統合
  lib/
    ai-comment.mjs    … Claude APIで一言コメント生成
    x-oauth1.mjs      … X投稿用のOAuth1.0a署名(公式サンプル値で検証済み)
data/                 … 検知結果の蓄積(すべてJSON、GitHubにコミットされ続ける)
```

## 今後の拡張アイデア

- 収益化: `public/index.html` にAdSenseタグやアフィリエイトリンクを追加
- Discord通知: 各checkスクリプトの検知ループ内でWebhookにPOSTするだけ
- 他ジャンルへの横展開: `RSS_URL` / `USERNAME` / `QUERY` を差し替えれば同じ仕組みを転用できる
- ユニット同士の類似度診断など、実際のゲームデータが手に入った場合のさらなる分析
