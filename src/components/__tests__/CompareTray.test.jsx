/* eslint-disable @next/next/no-img-element -- next/image is mocked in this test */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ useComparison: vi.fn() }));

vi.mock("@/hooks/useComparison", () => ({ useComparison: mocks.useComparison }));
vi.mock("next/image", () => ({
  default: ({ alt, src }) => <img alt={alt} src={typeof src === "string" ? src : ""} />,
}));
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }) => children,
  motion: {
    div: ({ children, initial, animate, exit, transition, ...rest }) => <div {...rest}>{children}</div>,
  },
}));

import CompareTray from "../CompareTray";

const items = [
  { _id: "mat-1", title: "Linear Algebra Notes", image: "/a.png" },
  { id: "mat-2", title: "Organic Chemistry", image: "/b.png" },
];

let removeFromComparison;
let clearComparison;
let openComparisonModal;

function setup(overrides = {}) {
  removeFromComparison = vi.fn();
  clearComparison = vi.fn();
  openComparisonModal = vi.fn();
  mocks.useComparison.mockReturnValue({
    comparedItems: items,
    isModalOpen: false,
    removeFromComparison,
    clearComparison,
    openComparisonModal,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setup();
});

describe("CompareTray", () => {
  it("renders nothing when no materials are selected", () => {
    mocks.useComparison.mockReturnValue({
      comparedItems: [],
      isModalOpen: false,
      removeFromComparison: vi.fn(),
      clearComparison: vi.fn(),
      openComparisonModal: vi.fn(),
    });
    const { container } = render(<CompareTray />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a thumbnail and remove button for each selected material", () => {
    render(<CompareTray />);
    expect(screen.getByText("Linear Algebra Notes")).toBeInTheDocument();
    expect(screen.getByText("Organic Chemistry")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^remove .* from comparison$/i })).toHaveLength(2);
  });

  it("removes the selected material when its remove button is clicked", () => {
    render(<CompareTray />);
    fireEvent.click(screen.getByRole("button", { name: /remove linear algebra notes from comparison/i }));
    expect(removeFromComparison).toHaveBeenCalledWith("mat-1");
  });

  it("clears every selected material", () => {
    render(<CompareTray />);
    fireEvent.click(screen.getByRole("button", { name: /clear all selected materials/i }));
    expect(clearComparison).toHaveBeenCalledOnce();
  });

  it("opens the comparison modal from the tray", () => {
    render(<CompareTray />);
    fireEvent.click(screen.getByRole("button", { name: /compare now/i }));
    expect(openComparisonModal).toHaveBeenCalledOnce();
  });

  it("explains the maximum count when three materials are selected", () => {
    setup({ comparedItems: [...items, { _id: "mat-3", title: "Physics" }] });
    render(<CompareTray />);
    expect(screen.getByText(/maximum of 3 reached/i)).toBeInTheDocument();
    expect(screen.getByText(/3 \/ 3 selected/i)).toBeInTheDocument();
  });

  it("does not show the limit warning below the maximum", () => {
    render(<CompareTray />);
    expect(screen.getByText(/2 \/ 3 selected/i)).toBeInTheDocument();
    expect(screen.queryByText(/maximum of 3 reached/i)).not.toBeInTheDocument();
  });

  it("hides while the comparison modal is open", () => {
    setup({ isModalOpen: true });
    const { container } = render(<CompareTray />);
    expect(container).toBeEmptyDOMElement();
  });

  it("collapses to a pill on mobile and expands on tap", () => {
    render(<CompareTray />);
    const pill = screen.getByRole("button", { name: /expand comparison tray, 2 of 3 selected/i });
    expect(pill).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(pill);

    expect(screen.getByRole("button", { name: /collapse comparison tray/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear all selected materials/i })).toBeInTheDocument();
  });
});
