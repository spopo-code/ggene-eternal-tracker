// 公式Xアカウント(@ggene_eternal)の新着投稿を検知するスクリプト。
//
// X APIは2026年から無料枠が無く従量課金制(1読み取り約$0.005)。
// チェック頻度を抑えれば個人利用では月あたり数十〜数百円程度に収まる。
// 本文はX公式のoEmbed(publish.twitter.com/oembed、無料・公式提供)で
// 埋め込みHTMLを取得するだけで、こちらで文章として転載・改変はしない。
//
// 必要な環境変数:
//   X_BEARER_TOKEN … X Developer Portalで発行するApp-only Bearer Token
//
// 使い方:
//   node scripts/check-x.mjs
//   FIXTURE=./fixtures/sample-x-user-tweets.json node scripts/check-x.mjs  … オフラインテスト

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { generateComment } from "./lib/ai-comment.mjs";

const USERNAME = "ggene_eternal";
const DATA_DIR = path.join(process.cwd(), "data");
const STATE_PATH = path.join(DATA_DIR, "x-state.json"); // { userId, lastTweetId }
const TWEETS_PATH = path.join(DATA_DIR, "tweets.json");

async function loadJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function xApiFetch(url) {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) throw new Error("X_BEARER_TOKEN is not set");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`X API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function getUserId(state) {
  if (state.userId) return state.userId;
  const data = await xApiFetch(
    `https://api.twitter.com/2/users/by/username/${USERNAME}`
  );
  return data.data.id;
}

async function getRecentTweets(userId, sinceId) {
  const params = new URLSearchParams({
    max_results: "10",
    exclude: "replies,retweets",
    "tweet.fields": "created_at",
  });
  if (sinceId) params.set("since_id", sinceId);
  const data = await xApiFetch(
    `https://api.twitter.com/2/users/${userId}/tweets?${params}`
  );
  return data.data ?? [];
}

// X公式のoEmbedは無料・認証不要。埋め込みHTMLを取得するだけなので
// ツイート本文を独自に書き起こす必要がない(=転載リスクを避けられる)。
async function getOEmbedHtml(tweetUrl) {
  try {
    const res = await fetch(
      `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrl)}&omit_script=true`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.html ?? null;
  } catch {
    return null;
  }
}

async function fetchFixtureTweets() {
  const raw = await readFile(process.env.FIXTURE, "utf8");
  return JSON.parse(raw);
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  // X_BEARER_TOKEN未設定(=まだX Developer登録前)でも、
  // ここでスキップするだけでWiki側の更新チェックは通常通り動く。
  if (!process.env.X_BEARER_TOKEN && !process.env.FIXTURE) {
    console.log("X_BEARER_TOKEN not set — skipping X check for now.");
    return;
  }

  const state = await loadJson(STATE_PATH, {});
  const tweets = await loadJson(TWEETS_PATH, []);

  let newTweets;
  if (process.env.FIXTURE) {
    newTweets = await fetchFixtureTweets();
  } else {
    const userId = await getUserId(state);
    state.userId = userId;
    newTweets = await getRecentTweets(userId, state.lastTweetId);
  }

  if (newTweets.length === 0) {
    console.log("no new tweets");
    await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
    return;
  }

  // 新しい順で返ってくるので、時系列順に処理してlastTweetIdを更新
  const chronological = [...newTweets].reverse();
  for (const t of chronological) {
    const url = `https://x.com/${USERNAME}/status/${t.id}`;
    const [oembedHtml, comment] = await Promise.all([
      getOEmbedHtml(url),
      generateComment({ kind: "tweet", title: t.text, extra: t.text }),
    ]);
    tweets.unshift({
      id: t.id,
      url,
      createdAt: t.created_at ?? new Date().toISOString(),
      oembedHtml, // nullの場合はサイト側でリンクのみ表示
      comment,
    });
    state.lastTweetId = t.id;
  }

  tweets.length = Math.min(tweets.length, 200);

  await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
  await writeFile(TWEETS_PATH, JSON.stringify(tweets, null, 2));
  console.log(`fetched ${newTweets.length} new tweet(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
