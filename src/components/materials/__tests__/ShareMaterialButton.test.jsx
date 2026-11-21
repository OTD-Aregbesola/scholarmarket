import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ShareMaterialButton from "../ShareMaterialButton";

const material = { _id: "mat-1", title: "Linear Algebra Notes" };

let writeText;
let share;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  writeText = vi.fn().mockResolvedValue(undefined);
  share = undefined;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  Object.defineProperty(navigator, "share", {
    configurable: true,
    writable: true,
    value: undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ShareMaterialButton", () => {
  it("copies a share message to the clipboard and confirms to the learner", async () => {
    render(<ShareMaterialButton material={material} />);

    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain("Linear Algebra Notes");
    expect(await screen.findByRole("button", { name: /shared!/i })).toBeInTheDocument();
  });

  it("tracks the share event over the network", async () => {
    render(<ShareMaterialButton material={material} />);

    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/analytics/track", expect.objectContaining({
      method: "POST",
    })));
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      event: "share_material",
      materialId: "mat-1",
    });
  });

  it("uses the native share menu when it is available instead of the clipboard", async () => {
    share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, writable: true, value: share });
    render(<ShareMaterialButton material={material} />);

    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({
      title: "Linear Algebra Notes",
    })));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("keeps the label unchanged when the learner cancels the native share dialog", async () => {
    const abort = new Error("cancelled");
    abort.name = "AbortError";
    Object.defineProperty(navigator, "share", {
      configurable: true,
      writable: true,
      value: vi.fn().mockRejectedValue(abort),
    });
    render(<ShareMaterialButton material={material} />);

    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => expect(navigator.share).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /^share$/i })).toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
  });
});
