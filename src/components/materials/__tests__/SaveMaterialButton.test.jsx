import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  useWallet: vi.fn(),
  useSavedMaterials: vi.fn(),
}));

vi.mock("@/hooks/useWallet", () => ({ useWallet: mocks.useWallet }));
vi.mock("@/hooks/api/useSavedMaterials", () => ({ useSavedMaterials: mocks.useSavedMaterials }));

import SaveMaterialButton from "../SaveMaterialButton";

const material = { _id: "mat-1", title: "Linear Algebra Notes" };

function setupWallet(overrides = {}) {
  mocks.useWallet.mockReturnValue({
    isConnected: true,
    connect: vi.fn(),
    state: { status: "ready" },
    ...overrides,
  });
}

function setupSaved(overrides = {}) {
  mocks.useSavedMaterials.mockReturnValue({
    isSaved: vi.fn(() => false),
    toggleSaved: vi.fn(),
    isToggling: false,
    pendingMaterialId: null,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupWallet();
  setupSaved();
});

describe("SaveMaterialButton", () => {
  it("toggles the material when connected", () => {
    const toggleSaved = vi.fn();
    setupSaved({ toggleSaved });
    render(<SaveMaterialButton material={material} variant="detail" />);

    fireEvent.click(screen.getByRole("button", { name: /save material/i }));

    expect(toggleSaved).toHaveBeenCalledWith(material);
  });

  it("reflects an optimistically saved state with aria-pressed and an Unsave label", () => {
    setupSaved({ isSaved: vi.fn(() => true) });
    render(<SaveMaterialButton material={material} variant="detail" />);

    const button = screen.getByRole("button", { name: /unsave material/i });
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("connects the wallet instead of toggling when disconnected", () => {
    const connect = vi.fn();
    const toggleSaved = vi.fn();
    setupWallet({ isConnected: false, connect });
    setupSaved({ toggleSaved });
    render(<SaveMaterialButton material={material} variant="detail" />);

    fireEvent.click(screen.getByRole("button", { name: /connect wallet to save/i }));

    expect(connect).toHaveBeenCalledOnce();
    expect(toggleSaved).not.toHaveBeenCalled();
  });

  it("disables itself while the toggle is pending or the wallet is busy", () => {
    setupSaved({ isToggling: true, pendingMaterialId: "mat-1" });
    const { rerender } = render(<SaveMaterialButton material={material} variant="detail" />);
    expect(screen.getByRole("button", { name: /updating/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /updating/i })).toHaveTextContent("Updating...");

    // A failed toggle leaves the component in the unsaved state again (rollback).
    setupSaved({ isToggling: false, pendingMaterialId: null, isSaved: vi.fn(() => false) });
    rerender(<SaveMaterialButton material={material} variant="detail" />);
    expect(screen.getByRole("button", { name: /save material/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /save material/i })).toHaveAttribute("aria-pressed", "false");
  });
});
