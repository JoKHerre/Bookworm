import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StarDisplay from "./StarDisplay";
import StarRating from "./StarRating";

describe("StarRating", () => {
  it("TST-01-T-1 star rating selects a star", async () => {
    const onChange = vi.fn();
    render(<StarRating value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "4 stars" }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("TST-01-T-1 star rating reflects its value", () => {
    const { rerender } = render(<StarRating value={3} onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "3 stars" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "4 stars" })).not.toBeChecked();

    rerender(<StarRating value={null} onChange={vi.fn()} />);
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).not.toBeChecked();
    }
    expect(screen.getByRole("radio", { name: "1 star" })).toBeInTheDocument();
  });

  it("TST-01-T-1 star rating can be disabled", () => {
    render(<StarRating value={2} onChange={vi.fn()} disabled />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(5);
    for (const radio of radios) expect(radio).toBeDisabled();
  });
});

describe("StarDisplay", () => {
  it("TST-01-T-1 star display describes rating", () => {
    render(<StarDisplay rating={4} />);
    expect(
      screen.getByRole("img", { name: "Rated 4 out of 5 stars" }),
    ).toBeInTheDocument();
  });
});
