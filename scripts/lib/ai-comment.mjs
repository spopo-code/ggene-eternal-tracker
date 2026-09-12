// AIによる推測コメント生成。
//
// 重要: ここに渡すのは「タイトル」「日時」「ツイート本文(公式発表そのもの)」
// といった短い事実だけ。Wiki本文(有志の考察記事)は絶対に渡さない。
// あくまで「事実からの推測コメント」を生成する用途に限定する。
//
// ANTHROPIC_API_KEY が未設定の場合は費用ゼロで動くよう、
// 定型文にフォールバックする(=課金しなくてもサイトは動く)。

const MODEL = "claude-haiku-4-5-20251001"; // 短文生成なので安価なモデルで十分

export async function generateComment({ kind, title, extra }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const fallback = kind === "tweet"
    ? `公式から新しい発表がありました。「${title}」`
    : `「${title}」のページに更新がありました。新ユニットやイベント情報の可能性があります。`;

  if (!apiKey) return fallback;

  const prompt = kind === "tweet"
    ? `以下はスマホゲーム「SDガンダム ジージェネレーション エターナル」(通称ジージェネエターナル)の公式X投稿です。
プレイヤー向けに、この発表がガチャ・編成・イベント攻略にどう関係しそうか、1文(40字程度)で推測コメントを書いてください。
断定は避け、「〜かもしれません」等の推測トーンにしてください。過度な煽りは避けてください。

公式投稿本文: ${extra ?? title}`
    : `以下はスマホゲーム「SDガンダム ジージェネレーション エターナル」(通称ジージェネエターナル)の有志Wikiで更新が検知されたページのタイトルです。
本文は分からない状態で、タイトルだけから「どんな内容の更新の可能性があるか」を1文(40字程度)で推測してください。
断定は避け、「〜かもしれません」等の推測トーンにしてください。分からないことを分かったふりで書かないでください。

ページタイトル: ${title}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.error("Anthropic API error", res.status, await res.text());
      return fallback;
    }
    const data = await res.json();
    const text = data.content?.find((b) => b.type === "text")?.text?.trim();
    return text || fallback;
  } catch (err) {
    console.error("Anthropic API call failed", err);
    return fallback;
  }
}
