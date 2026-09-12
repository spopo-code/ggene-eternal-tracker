// YouTube上の「ジージェネエターナル」関連動画を検知するスクリプト。
//
// 公式チャンネルだけでなく、実況者・攻略勢が上げる動画も
// キーワード検索(search.list)で横断的に拾う。個人チャンネルの
// 集合体としての鮮度を狙う設計。
//
// YouTube Data API v3 は無料枠(1日10,000ユニット)があり、
// search.list は1回100ユニット消費。1日数回のチェックなら
// 無料枠内に十分収まる。支払い情報の登録も不要。
//
// 必要な環境変数:
//   YOUTUBE_API_KEY … Google Cloud ConsoleでYouTube Data API v3を
//                      有効化し、APIキーを発行したもの(無料)。
//
// 使い方:
//   node scripts/check-youtube.mjs
//   FIXTURE=./fixtures/sample-youtube-search.json node scripts/check-youtube.mjs … オフラインテスト

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { generateComment } from "./lib/ai-comment.mjs";
import { postTweet } from "./lib/x-oauth1.mjs";

const QUERY = "ジージェネエターナル OR Gジェネエターナル";
const DATA_DIR = path.join(process.cwd(), "data");
const SEEN_PATH = path.join(DATA_DIR, "youtube-seen.json"); // videoId -> true
const VIDEOS_PATH = path.join(DATA_DIR, "videos.json");

async function loadJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function searchRecentVideos() {
  if (process.env.FIXTURE) {
    return JSON.parse(await readFile(process.env.FIXTURE, "utf8"));
  }
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null; // 呼び出し元でスキップ判定

  const params = new URLSearchParams({
    key: apiKey,
    q: QUERY,
    part: "snippet",
    type: "video",
    order: "date", // 新しい順
    maxResults: "15",
    relevanceLanguage: "ja",
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!res.ok) {
    throw new Error(`YouTube API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return (data.items ?? []).map((item) => ({
    id: item.id.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
  }));
}

// YouTube公式のoEmbed(無料・認証不要)でサムネ付き埋め込みHTMLを取得。
// これも「動画そのものを転載」ではなく公式の埋め込み枠を使うだけ。
async function getOEmbedHtml(videoUrl) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.html ?? null;
  } catch {
    return null;
  }
}

// 明らかに無関係な動画(タイトルにゲーム名を含むだけの別作品など)を
// 大雑把に除外する。厳密なフィルタではなく最低限のノイズ除去。
function looksRelevant(title) {
  return /ジージェネ|Gジェネ|ｇジェネ|GGET/i.test(title);
}

function buildVideoTweetText(channelTitle, videoTitle, comment, url) {
  const maxCommentLen = 60;
  const trimmed = comment.length > maxCommentLen ? comment.slice(0, maxCommentLen) + "…" : comment;
  return `【ジージェネエターナル】${channelTitle}さんの新着動画を検知\n${trimmed}\n${url}`;
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  const items = await searchRecentVideos();
  if (items === null) {
    console.log("YOUTUBE_API_KEY not set — skipping YouTube check for now.");
    return;
  }

  const relevant = items.filter((v) => looksRelevant(v.title));

  const seen = await loadJson(SEEN_PATH, {});
  const videos = await loadJson(VIDEOS_PATH, []);
  const isFirstRun = Object.keys(seen).length === 0;

  const newlyFound = relevant.filter((v) => !seen[v.id]);

  for (const v of newlyFound) {
    seen[v.id] = true;
  }

  if (newlyFound.length > 0) {
    for (const v of newlyFound) {
      const [oembedHtml, comment] = await Promise.all([
        getOEmbedHtml(v.url),
        generateComment({
          kind: "video",
          title: `${v.channelTitle}さんの動画「${v.title}」`,
        }),
      ]);
      videos.unshift({
        id: v.id,
        title: v.title,
        channelTitle: v.channelTitle,
        url: v.url,
        publishedAt: v.publishedAt,
        oembedHtml,
        comment,
      });

      // 初回実行(過去分の一括検知)ではツイートしない。2回目以降の本当の新着だけ。
      if (!isFirstRun) {
        const tweetText = buildVideoTweetText(v.channelTitle, v.title, comment, v.url);
        await postTweet(tweetText);
      }
    }
    videos.length = Math.min(videos.length, 200);
  }

  await writeFile(SEEN_PATH, JSON.stringify(seen, null, 2));
  await writeFile(VIDEOS_PATH, JSON.stringify(videos, null, 2));
  console.log(
    `found ${items.length} results, ${relevant.length} relevant, ${newlyFound.length} new` +
      (isFirstRun ? " (first run: baseline only)" : "")
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
