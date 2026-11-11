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

interface BookWithTags {
  details: { tags: readonly string[] } | null;
}

// Sorted, unique tags across a set of books; books without details add none.
export function libraryTags(books: readonly BookWithTags[]): string[] {
  const tags = new Set<string>();
  for (const book of books) {
    for (const tag of book.details?.tags ?? []) tags.add(tag);
  }
  return [...tags].sort();
}

// Books carrying the tag; an empty tag keeps every book.
export function filterByTag<T extends BookWithTags>(
  books: readonly T[],
  tag: string,
): T[] {
  if (!tag) return [...books];
  return books.filter((book) => book.details?.tags.includes(tag));
}

// Books carrying every selected tag; an empty selection keeps every book.
export function filterByTags<T extends BookWithTags>(
  books: readonly T[],
  tags: readonly string[],
): T[] {
  if (tags.length === 0) return [...books];
  return books.filter((book) =>
    tags.every((tag) => book.details?.tags.includes(tag)),
  );
}
