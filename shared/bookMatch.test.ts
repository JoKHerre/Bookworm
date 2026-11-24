import { expect, test } from "vitest";
import type { BookSearchResult } from "./books.ts";
import {
  authorsMatch,
  matchNeedsCheck,
  matchTitle,
  normalizeTitle,
  titlesMatch,
} from "./bookMatch.ts";

function book(key: string, title: string, authors: string[]): BookSearchResult {
  return { key: `/works/${key}`, title, author_name: authors };
}

test("IMP-02-T-1 normalizes titles", () => {
  expect(normalizeTitle("The Hobbit; or, There & Back Again")).toBe(
    "hobbit or there and back again",
  );
  expect(normalizeTitle("  Les Misérables  ")).toBe("les miserables");
  expect(normalizeTitle("A Wrinkle in Time")).toBe("wrinkle in time");
  expect(normalizeTitle("An Absolutely Remarkable Thing")).toBe(
    "absolutely remarkable thing",
  );
  expect(normalizeTitle("Theory of Everything")).toBe("theory of everything");
});

test("IMP-02-T-1 matches a title with or without subtitle", () => {
  expect(titlesMatch("Dune", "Dune: Deluxe Edition")).toBe(true);
  expect(titlesMatch("dune: deluxe edition", "DUNE")).toBe(true);
  expect(titlesMatch("Pride & Prejudice", "Pride and Prejudice")).toBe(true);
  expect(titlesMatch("Dune", "Dune Messiah")).toBe(false);
  expect(titlesMatch("!!!", "!!!")).toBe(false);
});

test("IMP-02-T-1 matches authors by name or surname", () => {
  expect(authorsMatch("Frank Herbert", ["Frank Herbert"])).toBe(true);
  expect(authorsMatch("Herbert, Frank", ["Frank Herbert"])).toBe(true);
  expect(authorsMatch("F. Herbert", ["Brian Herbert", "Frank Herbert"])).toBe(
    true,
  );
  expect(
    authorsMatch("Gabriel García Márquez", ["Gabriel Garcia Marquez"]),
  ).toBe(true);
  expect(authorsMatch("Frank Herbert", ["Isaac Asimov"])).toBe(false);
  expect(authorsMatch("Frank Herbert", [])).toBe(false);
});

test("IMP-02-T-1 matches one author's book", () => {
  const first = book("OL1W", "Dune", ["Frank Herbert"]);
  const candidates = [
    first,
    book("OL2W", "Dune", ["Frank Herbert"]),
    book("OL3W", "Dune Messiah", ["Frank Herbert"]),
  ];
  expect(matchTitle({ title: "Dune", author: "" }, candidates)).toStrictEqual({
    status: "matched",
    book: first,
  });
  expect(
    matchTitle({ title: "Dune", author: "Herbert, Frank" }, candidates),
  ).toStrictEqual({ status: "matched", book: first });

  // an adaptation lists another author first
  const adaptation = book("OL4W", "The Hobbit", [
    "Charles Dixon",
    "J.R.R. Tolkien",
  ]);
  const novel = book("OL5W", "The Hobbit", ["J.R.R. Tolkien"]);
  expect(
    matchTitle({ title: "The Hobbit", author: "Tolkien, J.R.R." }, [
      novel,
      adaptation,
    ]),
  ).toStrictEqual({ status: "matched", book: novel });

  // spellings of one author's name
  const hesse = book("OL6W", "Siddhartha", ["Hermann Hesse"]);
  expect(
    matchTitle({ title: "Siddhartha", author: "" }, [
      hesse,
      book("OL7W", "Siddhartha", ["Herman Hesse"]),
    ]),
  ).toStrictEqual({ status: "matched", book: hesse });
});

test("IMP-02-T-1 reports ambiguous titles", () => {
  const austen = book("OL1W", "Emma", ["Jane Austen"]);
  const other = book("OL2W", "Emma", ["Emma Tennant"]);
  expect(
    matchTitle({ title: "Emma", author: "" }, [
      austen,
      book("OL3W", "Emma", ["Jane Austen"]),
      other,
    ]),
  ).toStrictEqual({ status: "ambiguous", candidates: [austen, other] });

  const many = Array.from({ length: 7 }, (_, i) =>
    book(`OL${i + 10}W`, "Emma", [`Author${i} Name${i}`]),
  );
  expect(matchTitle({ title: "Emma", author: "" }, many)).toStrictEqual({
    status: "ambiguous",
    candidates: many.slice(0, 5),
  });

  // an author picks one of them
  expect(
    matchTitle({ title: "Emma", author: "Jane Austen" }, [other, austen]),
  ).toStrictEqual({ status: "matched", book: austen });
  // edition counts pick a clear favourite
  const withEditions = (b: BookSearchResult, edition_count: number) => ({
    ...b,
    edition_count,
  });
  const eyre = withEditions(
    book("OL20W", "Jane Eyre", ["Charlotte Brontë"]),
    1170,
  );
  const guide = withEditions(book("OL21W", "Jane Eyre", ["Maggie Berg"]), 85);
  expect(
    matchTitle({ title: "Jane Eyre", author: "" }, [guide, eyre]),
  ).toStrictEqual({ status: "matched", book: eyre });
  for (const [top, rival] of [
    [12, 3],
    [9, 1],
  ]) {
    expect(
      matchTitle({ title: "Jane Eyre", author: "" }, [
        withEditions(eyre, top!),
        withEditions(guide, rival!),
      ]).status,
    ).toBe("ambiguous");
  }
});

test("IMP-02-T-1 reports no match", () => {
  const dune = book("OL1W", "Dune", ["Frank Herbert"]);
  expect(
    matchTitle({ title: "Dune", author: "Isaac Asimov" }, [dune]),
  ).toStrictEqual({ status: "none" });
  expect(matchTitle({ title: "Foundation", author: "" }, [dune])).toStrictEqual(
    {
      status: "none",
    },
  );
  expect(matchTitle({ title: "Dune", author: "" }, [])).toStrictEqual({
    status: "none",
  });
});

test("IMP-03-T-1 flags a match with another title", () => {
  const dune = book("OL1W", "Dune", ["Frank Herbert"]);
  expect(matchNeedsCheck({ title: "The Dune", author: "" }, dune)).toBe(false);
  expect(matchNeedsCheck({ title: "Dune: Deluxe", author: "" }, dune)).toBe(
    false,
  );
  expect(
    matchNeedsCheck(
      { title: "Dune", author: "" },
      book("OL2W", "Dune: The Graphic Novel", []),
    ),
  ).toBe(true);
  expect(
    matchNeedsCheck(
      { title: "Dune: Book One", author: "" },
      book("OL2W", "Dune: The Graphic Novel", []),
    ),
  ).toBe(true);
  expect(matchNeedsCheck({ title: "Emma", author: "" }, dune)).toBe(true);
});

test("IMP-03-T-1 flags a match with another author", () => {
  const dune = book("OL1W", "Dune", ["Frank Herbert"]);
  expect(
    matchNeedsCheck({ title: "Dune", author: "Herbert, Frank" }, dune),
  ).toBe(false);
  expect(matchNeedsCheck({ title: "Dune", author: "Jane Austen" }, dune)).toBe(
    true,
  );
  expect(
    matchNeedsCheck(
      { title: "Dune", author: "Jane Austen" },
      { key: "/works/OL1W", title: "Dune" },
    ),
  ).toBe(true);
});
