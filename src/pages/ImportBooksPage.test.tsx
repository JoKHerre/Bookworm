import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IMPORT_MAX_FILE_BYTES } from "../../shared/bookImport";
import { renderWithProviders } from "../test/renderWithProviders";
import ImportBooksPage from "./ImportBooksPage";

const choose = (file: File) =>
  userEvent.upload(screen.getByLabelText("Choose a CSV file"), file, {
    applyAccept: false,
  });
const upload = () => screen.getByRole("button", { name: "Upload" });
const csv = (name = "books.csv", content = "title\nDune\n") =>
  new File([content], name, { type: "text/csv" });

function setup() {
  return renderWithProviders(<ImportBooksPage />, {
    route: "/import",
    user: { id: 1, email: "a@b.co" },
  });
}

describe("ImportBooksPage", () => {
  it("IMP-01-T-2 rejects an unsupported file type", async () => {
    setup();
    await choose(new File(["title"], "books.txt", { type: "text/plain" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unsupported file type. Choose a .csv file.",
    );
    expect(upload()).toBeDisabled();
  });

  it("IMP-01-T-2 rejects an empty file", async () => {
    setup();
    await choose(csv("empty.csv", ""));
    expect(screen.getByRole("alert")).toHaveTextContent("This file is empty.");
    expect(upload()).toBeDisabled();
  });

  it("IMP-01-T-2 rejects an oversized file", async () => {
    setup();
    await choose(csv("big.csv", "x".repeat(IMPORT_MAX_FILE_BYTES + 1)));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This file is too large. The limit is 1 MB.",
    );
    expect(upload()).toBeDisabled();
  });

  it("IMP-01-T-2 accepts a csv file", async () => {
    setup();
    expect(upload()).toBeDisabled();
    await choose(csv("books.csv", "x".repeat(2048)));
    expect(screen.getByText("books.csv (2 KB)")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(upload()).toBeEnabled();
  });

  it("IMP-01-T-2 choosing another file replaces the result", async () => {
    setup();
    await choose(new File(["x"], "books.txt"));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await choose(csv());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/^books\.csv/)).toBeInTheDocument();
    expect(upload()).toBeEnabled();
  });

  it("IMP-01-T-2 clearing the selection resets the page", async () => {
    setup();
    await choose(csv());
    fireEvent.change(screen.getByLabelText("Choose a CSV file"), {
      target: { files: [] },
    });
    expect(upload()).toBeDisabled();
    expect(screen.queryByText(/^books\.csv/)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("IMP-01-T-2 upload reads the file", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    setup();
    await choose(csv());
    await userEvent.click(upload());

    expect(await screen.findByRole("status")).toHaveTextContent(
      "books.csv is ready to import.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("IMP-01-T-2 failed read shows an error and can retry", async () => {
    setup();
    const file = csv();
    vi.spyOn(file, "text").mockRejectedValueOnce(new Error("disk"));
    await choose(file);

    await userEvent.click(upload());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not read this file. Please try again.",
    );
    expect(upload()).toBeEnabled();

    await userEvent.click(upload());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "books.csv is ready to import.",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
