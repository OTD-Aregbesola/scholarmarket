import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ResourceStatusBadge, { deriveBadges, StatusBadge } from "../ResourceStatusBadge";

describe("deriveBadges", () => {
  it("returns no badges for missing material", () => {
    expect(deriveBadges(null)).toEqual([]);
  });

  it("marks a zero-priced, unrated material as Free and New", () => {
    expect(deriveBadges({ price: 0, feedbackCount: 0 })).toEqual(["Free", "New"]);
  });

  it("marks a top rated, popular, verified public resource correctly", () => {
    const badges = deriveBadges({
      price: 1200,
      averageScore: 4.8,
      feedbackCount: 25,
      likes: 1500,
      verified: true,
      visibility: "public",
    });
    expect(badges).toEqual(["Top Rated", "Verified", "Popular", "Published"]);
  });

  it("derives Draft and Unlisted visibility labels", () => {
    expect(deriveBadges({ price: 10, feedbackCount: 1, averageScore: 3, visibility: "private" })).toContain("Draft");
    expect(deriveBadges({ price: 10, feedbackCount: 1, averageScore: 3, visibility: "unlisted" })).toContain("Unlisted");
  });
});

describe("StatusBadge", () => {
  it.each([
    ["Free", "bg-emerald-50"],
    ["New", "bg-blue-50"],
    ["Top Rated", "bg-amber-50"],
    ["Verified", "bg-indigo-50"],
    ["Popular", "bg-purple-50"],
    ["Published", "bg-green-50"],
    ["Draft", "bg-gray-100"],
    ["Unlisted", "bg-orange-50"],
  ])("applies the correct colour class for %s", (label, colourClass) => {
    render(<StatusBadge label={label} />);
    const badge = screen.getByLabelText(`Status: ${label}`);
    expect(badge).toHaveClass(colourClass);
    expect(badge).toHaveTextContent(label);
  });
});

describe("ResourceStatusBadge", () => {
  it("renders one list item per derived badge", () => {
    render(<ResourceStatusBadge material={{ price: 0, feedbackCount: 0, visibility: "public" }} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByLabelText("Status: Free")).toBeInTheDocument();
    expect(screen.getByLabelText("Status: Published")).toBeInTheDocument();
  });

  it("honours the max prop to limit visible badges", () => {
    render(<ResourceStatusBadge material={{ price: 0, feedbackCount: 0, visibility: "public" }} max={1} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByLabelText("Status: Free")).toBeInTheDocument();
  });

  it("renders creator and updated badges when requested", () => {
    render(
      <ResourceStatusBadge
        material={{ price: 10, feedbackCount: 1, averageScore: 4, author: "Ada", updatedAt: "2026-01-15T00:00:00Z" }}
        showCreator
        showUpdatedAt
      />
    );
    expect(screen.getByLabelText("Creator: Ada")).toBeInTheDocument();
    expect(screen.getByLabelText(/Last updated:/)).toBeInTheDocument();
  });

  it("renders nothing when there are no badges to show", () => {
    const { container } = render(<ResourceStatusBadge material={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
