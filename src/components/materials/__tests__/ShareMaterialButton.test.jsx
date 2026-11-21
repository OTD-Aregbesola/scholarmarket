import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ShareMaterialButton from "../ShareMaterialButton";

const toastShow = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ show: toastShow }),
}));

const material = { _id: "mat-1", title: "Linear Algebra Notes" };

let writeText;
let share;

beforeEach(() => {
  toastShow.mockClear();
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
    expect(writeText.mock.calls[0][0]).toContain("utm_source=share");
    expect(await screen.findByRole("button", { name: /shared!/i })).toBeInTheDocument();
  });

  it("shows a confirmation toast via useToast after copying to clipboard", async () => {
    render(<ShareMaterialButton material={material} />);

    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(toastShow).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
      })
    );
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
      url: expect.stringContaining("utm_source=share"),
    })));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("includes title, short description and canonical URL with utm_source in share payload", async () => {
    share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, writable: true, value: share });
    const detailed = {
      _id: "mat-42",
      title: "Calculus III Summary",
      shortDescription: "Multivariable calculus cheat sheet and vector fields",
    };
    render(<ShareMaterialButton material={detailed} />);

    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => expect(share).toHaveBeenCalledWith({
      title: "Calculus III Summary",
      text: "Multivariable calculus cheat sheet and vector fields",
      url: expect.stringMatching(/\/marketplace\/mat-42\?.*utm_source=share/),
    }));
  });

  it("uses canonicalUrl when provided on material", async () => {
    share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, writable: true, value: share });
    const canonicalItem = {
      title: "Physics 101",
      canonicalUrl: "https://scholarmarket.org/marketplace/physics-101",
    };
    render(<ShareMaterialButton material={canonicalItem} />);

    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://scholarmarket.org/marketplace/physics-101?utm_source=share",
    })));
  });

  it("keeps the label unchanged when the learner cancels the native share dialog and does not show an error toast", async () => {
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
    expect(toastShow).not.toHaveBeenCalled();
  });

  it("shows an error toast when sharing fails with a non-abort error", async () => {
    const error = new Error("Share failed");
    error.name = "NotAllowedError";
    Object.defineProperty(navigator, "share", {
      configurable: true,
      writable: true,
      value: vi.fn().mockRejectedValue(error),
    });
    render(<ShareMaterialButton material={material} />);

    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => expect(toastShow).toHaveBeenCalledWith(expect.objectContaining({
      type: "error",
    })));
  });
});
