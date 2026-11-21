import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  useMaterialNote: vi.fn(),
  useSaveMaterialNote: vi.fn(),
}));

vi.mock("@/hooks/api/useMaterials", () => ({
  useMaterialNote: mocks.useMaterialNote,
  useSaveMaterialNote: mocks.useSaveMaterialNote,
}));

import LearnerNotes from "../LearnerNotes";

let mutate;

beforeEach(() => {
  vi.clearAllMocks();
  mutate = vi.fn((value, options) => options?.onSuccess?.());
  mocks.useMaterialNote.mockReturnValue({
    isLoading: false,
    isSuccess: true,
    data: { note: "Existing note", updatedAt: "2026-01-01T00:00:00Z" },
    error: null,
  });
  mocks.useSaveMaterialNote.mockReturnValue({ mutate, isPending: false, error: null });
});

describe("LearnerNotes", () => {
  it("loads and displays a saved note", () => {
    render(<LearnerNotes materialId="mat-1" walletAddress="GCUSTOMER" />);
    expect(screen.getByLabelText("Personal notes for this resource")).toHaveValue("Existing note");
    expect(screen.getByText("Notes saved")).toBeInTheDocument();
  });

  it("shows a loading placeholder while the note is being fetched", () => {
    mocks.useMaterialNote.mockReturnValue({ isLoading: true, data: undefined, error: null });
    render(<LearnerNotes materialId="mat-1" walletAddress="GCUSTOMER" />);
    expect(screen.getByLabelText("Your notes")).toHaveClass("animate-pulse");
  });

  it("edits and saves an updated note", () => {
    render(<LearnerNotes materialId="mat-1" walletAddress="GCUSTOMER" />);
    const textarea = screen.getByLabelText("Personal notes for this resource");
    fireEvent.change(textarea, { target: { value: "A revised takeaway" } });

    const saveButton = screen.getByRole("button", { name: /save notes/i });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    expect(mutate).toHaveBeenCalledWith("A revised takeaway", expect.objectContaining({ onSuccess: expect.any(Function) }));
  });

  it("displays a save error when persistence fails", () => {
    mocks.useSaveMaterialNote.mockReturnValue({
      mutate,
      isPending: false,
      error: { message: "Could not save note" },
    });
    render(<LearnerNotes materialId="mat-1" walletAddress="GCUSTOMER" />);
    expect(screen.getByText("Could not save note")).toBeInTheDocument();
  });

  it("treats a 404 as an empty note rather than an error", () => {
    mocks.useMaterialNote.mockReturnValue({
      isLoading: false,
      isSuccess: false,
      data: undefined,
      error: { status: 404 },
    });
    render(<LearnerNotes materialId="mat-1" walletAddress="GCUSTOMER" />);
    expect(screen.getByLabelText("Personal notes for this resource")).toHaveValue("");
    expect(screen.queryByText(/failed to load/i)).not.toBeInTheDocument();
  });
});
