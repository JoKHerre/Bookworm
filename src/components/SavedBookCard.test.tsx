import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SavedBookCard, { type SavedBookCardData } from "./SavedBookCard";

const BOOK: SavedBookCardData = {
  id: 12,
  bookKey: "/works/OL1W",
  readingStatus: "currently_reading",
  details: {
    key: "/works/OL1W",
    title: "Dune",
    authors: ["Frank Herbert"],
    covers: [42],
    tags: [],
  },
};
function props() {
  return {
    book: BOOK,
    removeFrom: "collection" as const,
    onViewBook: vi.fn(),
    onReadingStatusChange: vi.fn(),
    onRemove: vi.fn(),
  };
}

describe("SavedBookCard", () => {
  it("shows metadata and connects details, status, and membership actions", async () => {
    const callbacks = props();
    render(
      <ul>
        <SavedBookCard {...callbacks} rating={4} />
      </ul>,
    );
    expect(screen.getByRole("img", { name: "Cover of Dune" })).toHaveAttribute(
      "src",
      "https://covers.openlibrary.org/b/id/42-M.jpg",
    );
    expect(screen.getByText("Frank Herbert")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Rated 4 out of 5 stars" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "View details for Dune" }),
    );
    expect(callbacks.onViewBook).toHaveBeenCalledOnce();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Reading status for Dune" }),
      "finished",
    );
    expect(callbacks.onReadingStatusChange).toHaveBeenCalledWith("finished");
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Dune from collection" }),
    );
    expect(callbacks.onRemove).toHaveBeenCalledOnce();
  });
  it("distinguishes removal from My Library", () => {
    render(
      <ul>
        <SavedBookCard {...props()} removeFrom="library" />
      </ul>,
    );
    expect(
      screen.getByRole("button", { name: "Remove Dune from my library" }),
    ).toHaveTextContent("Remove");
    expect(
      screen.queryByText("Remove from collection"),
    ).not.toBeInTheDocument();
  });
  it("keeps book identity and removal available without metadata", () => {
    render(
      <ul>
        <SavedBookCard {...props()} book={{ ...BOOK, details: null }} />
      </ul>,
    );
    expect(screen.getByText("/works/OL1W")).toBeInTheDocument();
    expect(screen.getByText("Author unavailable")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Remove Book details unavailable from collection",
      }),
    ).toBeEnabled();
  });
  it.each(["remove", "status"])(
    "prevents conflicting actions during %s and displays errors",
    (action) => {
      render(
        <ul>
          <SavedBookCard
            {...props()}
            isRemoving={action === "remove"}
            isUpdatingReadingStatus={action === "status"}
            readingStatusError="Status failed"
            removalError="Removal failed"
          />
        </ul>,
      );
      expect(screen.getByRole("combobox")).toBeDisabled();
      expect(
        screen.getByRole("button", {
          name: `${action === "remove" ? "Removing" : "Remove"} Dune from collection`,
        }),
      ).toBeDisabled();
      expect(screen.getAllByRole("alert")).toHaveLength(2);
      expect(screen.getByRole("combobox")).toHaveAccessibleDescription(
        "Status failed",
      );
    },
  );
});
