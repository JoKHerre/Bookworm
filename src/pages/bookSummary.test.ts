import { describe, expect, it } from "vitest";
import { summaryParagraphs } from "./bookSummary";

describe("summaryParagraphs", () => {
  it("splits paragraphs and joins wrapped lines", () => {
    expect(summaryParagraphs("One\r\ntwo.\r\n\r\nThree.\n\n\nFour.")).toEqual([
      "One two.",
      "Three.",
      "Four.",
    ]);
  });

  it("removes bold, italics and escapes", () => {
    expect(
      summaryParagraphs(
        "**Book Two** of the _series_, *really*. Book \\[1/9\\], 2 * 3 * 4, snake_case_name.",
      ),
    ).toEqual([
      "Book Two of the series, really. Book [1/9], 2 * 3 * 4, snake_case_name.",
    ]);
  });

  it("keeps link text and drops reference definitions", () => {
    expect(
      summaryParagraphs(
        "See [Dune](https://openlibrary.org/works/OL1W) ([source][1])\n\n[1]: https://example.com",
      ),
    ).toEqual(["See Dune (source)"]);
  });

  it("drops the list of other works after a rule", () => {
    expect(
      summaryParagraphs(
        "A fireman burns books.\r\n\r\n----------\r\nAlso contained in:\r\n\r\n- [Stories](https://openlibrary.org/works/OL2W)",
      ),
    ).toEqual(["A fireman burns books."]);
    expect(
      summaryParagraphs("A story.\n\nAlso contained in:\n- [Works](https://x)"),
    ).toEqual(["A story."]);
  });

  it("returns nothing for a blank description", () => {
    expect(summaryParagraphs(" \n\n ")).toEqual([]);
  });
});
