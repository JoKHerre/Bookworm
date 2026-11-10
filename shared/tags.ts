export const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 40;

// Turn Open Library subjects into short, lowercase, unique tags.
export function toTags(subjects: readonly string[] = []): string[] {
  const tags = new Set<string>();

  for (const subject of subjects) {
    const tag = subject.trim().replace(/\s+/g, " ").toLowerCase();
    // colons mark Open Library machine tags such as "nyt:hardcover-fiction=..."
    if (!tag || tag.length > MAX_TAG_LENGTH || tag.includes(":")) continue;

    tags.add(tag);
    if (tags.size === MAX_TAGS) break;
  }

  return [...tags];
}
