import { Router } from 'express';

interface OpenLibraryResponse {
  docs?: {
    key: string;
    title: string;
    author_name?: string[];
    first_publish_year?: number;
    cover_i?: number;
  }[];
  numFound?: number;
}

export const booksRouter: Router = Router();

booksRouter.get('/search', async (req, res) => {
  const query = req.query.q;

  if (typeof query !== 'string' || !query.trim()) {
    res.status(400).json({
      error: 'Please enter a book title or author'
    });
    return;
  }

  try {
    const url = new URL('https://openlibrary.org/search.json');

    url.searchParams.set('q', query.trim());
    url.searchParams.set(
      'fields',
      'key,title,author_name,first_publish_year,cover_i'
    );
    url.searchParams.set('limit', '20');

    const response = await fetch(url);

    if (!response.ok) {
      res.status(502).json({
        error: 'Failed to retrieve books from Open Library'
      });
      return;
    }

    const data = (await response.json()) as OpenLibraryResponse;

    res.json({
      books: data.docs ?? [],
      total: data.numFound ?? 0
    });
  } catch (error) {
    console.error('Book search error:', error);

    res.status(500).json({
      error: 'Something went wrong while searching for books'
    });
  }
});

booksRouter.get('/details', async (req, res) => {
  const key = req.query.key;

  if (
    typeof key !== 'string' ||
    !/^\/works\/OL\d+W$/.test(key)
  ) {
    res.status(400).json({
      error: 'Invalid book key'
    });
    return;
  }

  try {
    const response = await fetch(
      `https://openlibrary.org${key}.json`
    );

    if (!response.ok) {
      res.status(404).json({
        error: 'Book not found'
      });
      return;
    }

    const data = await response.json() as {
      key: string;
      title: string;
      description?: string | { value: string };
      authors?: { author: { key: string } }[];
      first_publish_date?: string;
      covers?: number[];
      subjects?: string[];
    };

    const authors = await Promise.all(
      (data.authors ?? []).slice(0, 5).map(async (entry) => {
        try {
          const authorResponse = await fetch(
            `https://openlibrary.org${entry.author.key}.json`
          );

          if (!authorResponse.ok) {
            return null;
          }

          const author = await authorResponse.json() as {
            name?: string;
          };

          return author.name ?? null;
        } catch {
          return null;
        }
      })
    );

    res.json({
      key: data.key,
      title: data.title,
      description: data.description,
      authors: authors.filter((name) => name !== null),
      first_publish_date: data.first_publish_date,
      covers: data.covers,
      subjects: data.subjects
    });
  } catch (error) {
    console.error('Book details error:', error);

    res.status(500).json({
      error: 'Something went wrong while loading book details'
    });
  }
});