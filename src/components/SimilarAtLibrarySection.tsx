import { useEffect, useState } from "react";
import type { BookFormat, TitleSearchResult } from "../../shared/titleSearch";
import { searchLibraryByTitle } from "../api/books";

function SimilarAtLibrarySection({
  title,
  format,
  heading,
}: {
  title: string;
  format: BookFormat;
  heading: string;
}) {
  const [results, setResults] = useState<TitleSearchResult[]>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    searchLibraryByTitle(title, format, signal)
      .then((data) => {
        if (!signal.aborted) setResults(data.results);
      })
      .catch((err) => {
        if (!signal.aborted) {
          setError(err instanceof Error ? err.message : "Search failed");
        }
      });

    return () => controller.abort();
  }, [title, format]);

  return (
    <section className="library-availability">
      <h2>{heading}</h2>
      {error ? (
        <p role="alert">{error}</p>
      ) : results === undefined ? (
        <p role="status">Searching library...</p>
      ) : results.length === 0 ? (
        <p>No titles found.</p>
      ) : (
        results.map((r) => {
          const meta = [r.author?.replace(/,$/, ""), r.format]
            .filter(Boolean)
            .join(" · ");
          return (
            <div className="library-record" key={r.bibid}>
              <p className="library-record-title">
                <a
                  href={`https://catalog.santacruzpl.org/polaris/search/title.aspx?ctx=1.1033.0.0.1&cn=${encodeURIComponent(r.bibid)}`}
                >
                  {r.title}
                </a>
              </p>
              {meta && <p className="library-record-meta">{meta}</p>}
            </div>
          );
        })
      )}
    </section>
  );
}

export default SimilarAtLibrarySection;
