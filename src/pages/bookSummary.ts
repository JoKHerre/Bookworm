// Open Library descriptions are Markdown, often ending with a "----------"
// rule and a list of links to other works. Keep the description itself as
// plain paragraphs.
export function summaryParagraphs(description: string): string[] {
  const lines = description.replace(/\r\n?/g, "\n").split("\n");
  const end = lines.findIndex(
    (line) => /^\s*-{3,}\s*$/.test(line) || /^\s*Also contained in/i.test(line),
  );
  const text = (end === -1 ? lines : lines.slice(0, end))
    .filter((line) => !/^\s*\[[^\]]+\]:\s*\S+/.test(line))
    .join("\n")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])\*(?!\s)(.+?)\*(?!\w)/g, "$1$2")
    .replace(/(^|[^\w_])_(?!\s)(.+?)_(?!\w)/g, "$1$2")
    .replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1");

  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}
