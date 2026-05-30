/** Extract plain text from a TipTap JSON doc string. */
export function extractDocText(raw: string): string {
  try {
    const doc = JSON.parse(raw);
    if (doc?.type === "doc") {
      const texts: string[] = [];
      const walk = (n: any) => {
        if (n.text) texts.push(n.text);
        if (n.content) n.content.forEach(walk);
      };
      if (doc.content) doc.content.forEach(walk);
      return texts.join("");
    }
  } catch {}
  return raw;
}

/** Wrap plain text into a TipTap JSON doc string. */
export function wrapAsDoc(text: string): string {
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
  });
}
