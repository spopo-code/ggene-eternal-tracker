// X (Twitter) API v2 へのツイート投稿。
//
// 読み取り(check-x.mjs)は App-only Bearer Token でOKだが、
// 投稿(このファイル)は「自分のアカウントとして書き込む」操作なので
// OAuth 1.0a のユーザーコンテキスト認証が必要。
// X Developer Portal のApp設定で
//   User authentication settings → OAuth 1.0a → Read and write
// を有効にした上で、Consumer Key/Secret と Access Token/Secret を
// 発行して環境変数に設定する。
//
// 必要な環境変数:
//   X_API_KEY, X_API_KEY_SECRET       … Consumer Key/Secret
//   X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET … Access Token/Secret(Read and write権限で発行)

import crypto from "node:crypto";

function percentEncode(str) {
  return encodeURIComponent(str).replace(
    /[!*'()]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function buildOAuthHeader({ url, method, consumerKey, consumerSecret, token, tokenSecret }) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: "1.0",
  };

  const paramString = Object.entries(oauthParams)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString),
  ].join("&");

  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  const signature = crypto
    .createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");

  const headerParams = { ...oauthParams, oauth_signature: signature };
  const header =
    "OAuth " +
    Object.entries(headerParams)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
      .join(", ");

  return header;
}

export function hasXWriteCredentials() {
  return Boolean(
    process.env.X_API_KEY &&
      process.env.X_API_KEY_SECRET &&
      process.env.X_ACCESS_TOKEN &&
      process.env.X_ACCESS_TOKEN_SECRET
  );
}

export async function postTweet(text) {
  if (!hasXWriteCredentials()) {
    console.log("X write credentials not set — skipping tweet post.");
    return null;
  }

  const url = "https://api.twitter.com/2/tweets";
  const authHeader = buildOAuthHeader({
    url,
    method: "POST",
    consumerKey: process.env.X_API_KEY,
    consumerSecret: process.env.X_API_KEY_SECRET,
    token: process.env.X_ACCESS_TOKEN,
    tokenSecret: process.env.X_ACCESS_TOKEN_SECRET,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "content-type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    console.error("X post failed", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return data.data; // { id, text }
}
