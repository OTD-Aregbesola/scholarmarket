import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, act, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { comparisonMaterials } from "../../../test/fixtures/index.js";

const toastShow = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ show: toastShow }),
}));

vi.mock("framer-motion", () => {
  const strip = ({ initial, animate, exit, transition, ...rest }) => rest;
  return {
    AnimatePresence: ({ children }) => <>{children}</>,
    motion: new Proxy(
      {},
      {
        get: (_, tag) =>
          function MotionStub({ children, ...props }) {
            return React.createElement(tag, strip(props), children);
          },
      }
    ),
  };
});

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ fill, alt, ...props }) => <img alt={alt} {...props} />,
}));

import ComparisonMatrix from "@/components/ComparisonMatrix";
import { ComparisonProvider, useComparison } from "@/providers/ComparisonProvider";

const [calculus, physics, essay, chemistry] = comparisonMaterials;

function Controls() {
  const { addToComparison, comparedItems } = useComparison();
  return (
    <div>
      {comparisonMaterials.map((m) => (
        <button key={m._id || m.id} onClick={() => addToComparison(m)}>
          add {m.title}
        </button>
      ))}
      <button onClick={() => addToComparison({ title: "No id" })}>add no id</button>
      <span data-testid="count">{comparedItems.length}</span>
    </div>
  );
}

function renderMatrix() {
  return render(
    <ComparisonProvider>
      <Controls />
      <ComparisonMatrix />
    </ComparisonProvider>
  );
}

const wrapper = ({ children }) => <ComparisonProvider>{children}</ComparisonProvider>;

async function addAll(user, items) {
  for (const item of items) {
    await user.click(screen.getByRole("button", { name: `add ${item.title}` }));
  }
}

describe("useComparison and ComparisonProvider", () => {
  beforeEach(() => {
    toastShow.mockClear();
  });

  it("throws when used outside a ComparisonProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useComparison())).toThrow(
      "useComparison must be used within a ComparisonProvider"
    );
    spy.mockRestore();
  });

  it("adds items, accepting both _id and id", () => {
    const { result } = renderHook(() => useComparison(), { wrapper });
    act(() => result.current.addToComparison(calculus));
    act(() => result.current.addToComparison(physics));
    expect(result.current.comparedItems).toEqual([calculus, physics]);
    expect(toastShow).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
  });

  it("ignores items without an id", () => {
    const { result } = renderHook(() => useComparison(), { wrapper });
    act(() => result.current.addToComparison({ title: "No id" }));
    expect(result.current.comparedItems).toEqual([]);
    expect(toastShow).not.toHaveBeenCalled();
  });

  it("does not add the same item twice", () => {
    const { result } = renderHook(() => useComparison(), { wrapper });
    act(() => result.current.addToComparison(calculus));
    act(() => result.current.addToComparison(calculus));
    expect(result.current.comparedItems).toHaveLength(1);
    expect(toastShow).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Already Added" }));
  });

  it("enforces the maximum of 3 items", () => {
    const { result } = renderHook(() => useComparison(), { wrapper });
    act(() => result.current.addToComparison(calculus));
    act(() => result.current.addToComparison(physics));
    act(() => result.current.addToComparison(essay));
    act(() => result.current.addToComparison(chemistry));
    expect(result.current.comparedItems).toEqual([calculus, physics, essay]);
    expect(toastShow).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Comparison Limit Reached", type: "error" })
    );
  });

  it("removes an item by id and frees a slot", () => {
    const { result } = renderHook(() => useComparison(), { wrapper });
    act(() => result.current.addToComparison(calculus));
    act(() => result.current.addToComparison(physics));
    act(() => result.current.removeFromComparison("cmp_2"));
    expect(result.current.comparedItems).toEqual([calculus]);
    act(() => result.current.addToComparison(essay));
    act(() => result.current.addToComparison(chemistry));
    expect(result.current.comparedItems).toHaveLength(3);
  });

  it("does not toast when removing an unknown id", () => {
    const { result } = renderHook(() => useComparison(), { wrapper });
    act(() => result.current.addToComparison(calculus));
    toastShow.mockClear();
    act(() => result.current.removeFromComparison("missing"));
    expect(result.current.comparedItems).toHaveLength(1);
    expect(toastShow).not.toHaveBeenCalled();
  });

  it("clears all items", () => {
    const { result } = renderHook(() => useComparison(), { wrapper });
    act(() => result.current.addToComparison(calculus));
    act(() => result.current.addToComparison(physics));
    act(() => result.current.clearComparison());
    expect(result.current.comparedItems).toEqual([]);
  });

  it("refuses to open the modal when the list is empty", () => {
    const { result } = renderHook(() => useComparison(), { wrapper });
    act(() => result.current.openComparisonModal());
    expect(result.current.isModalOpen).toBe(false);
    expect(toastShow).toHaveBeenCalledWith(expect.objectContaining({ title: "Empty List" }));
  });

  it("opens and closes the modal when items exist", () => {
    const { result } = renderHook(() => useComparison(), { wrapper });
    act(() => result.current.addToComparison(calculus));
    act(() => result.current.openComparisonModal());
    expect(result.current.isModalOpen).toBe(true);
    act(() => result.current.closeComparisonModal());
    expect(result.current.isModalOpen).toBe(false);
  });
});

describe("ComparisonMatrix", () => {
  beforeEach(() => {
    toastShow.mockClear();
  });

  it("renders nothing in the empty state", () => {
    const { container } = render(
      <ComparisonProvider>
        <ComparisonMatrix />
      </ComparisonProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the drawer with the selected count and item titles", async () => {
    const user = userEvent.setup();
    renderMatrix();
    await addAll(user, [calculus, physics]);
    expect(screen.getByText(/2 \/ 3 selected/)).toBeInTheDocument();
    expect(screen.getByText("Calculus Notes")).toBeInTheDocument();
    expect(screen.getByText("Physics Slides")).toBeInTheDocument();
  });

  it("removes an item from the drawer", async () => {
    const user = userEvent.setup();
    renderMatrix();
    await addAll(user, [calculus, physics]);
    await user.click(screen.getAllByRole("button", { name: "Remove item" })[0]);
    expect(screen.queryByText("Calculus Notes")).not.toBeInTheDocument();
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });

  it("stops at 3 items in the UI", async () => {
    const user = userEvent.setup();
    renderMatrix();
    await addAll(user, comparisonMaterials);
    expect(screen.getByTestId("count")).toHaveTextContent("3");
    expect(screen.getByText(/3 \/ 3 selected/)).toBeInTheDocument();
    expect(screen.queryByText("Chemistry Sheet")).not.toBeInTheDocument();
  });

  it("hides the drawer when the last item is cleared", async () => {
    const user = userEvent.setup();
    renderMatrix();
    await addAll(user, [calculus]);
    await user.click(screen.getByRole("button", { name: /Clear/ }));
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it("renders every attribute row for each item in the matrix", async () => {
    const user = userEvent.setup();
    renderMatrix();
    await addAll(user, [calculus, physics, essay]);
    await user.click(screen.getByRole("button", { name: /Compare Now/ }));

    const table = screen.getByRole("table");
    ["Details", "Price", "Rating", "Subject", "File Format", "Licensing Terms"].forEach((label) => {
      expect(within(table).getByText(label)).toBeInTheDocument();
    });
    ["Calculus Notes", "Physics Slides", "Essay Guide"].forEach((title) => {
      expect(within(table).getByRole("heading", { name: title })).toBeInTheDocument();
    });

    // One cell per item, in the order the items were added.
    const cellsFor = (label) =>
      within(within(table).getByText(label).closest("tr")).getAllByRole("cell").slice(1);

    const price = cellsFor("Price");
    expect(price).toHaveLength(3);
    expect(price[0]).toHaveTextContent(/^10 XLM$/);
    expect(price[1]).toHaveTextContent(/^25 XLM$/);
    expect(price[2]).toHaveTextContent(/^5 XLM$/);

    const rating = cellsFor("Rating");
    expect(rating[0]).toHaveTextContent("4.5");
    expect(rating[0]).toHaveTextContent("12 recommendation likes");
    expect(rating[1]).toHaveTextContent("3.2");
    expect(rating[1]).toHaveTextContent("3 recommendation likes");

    const subject = cellsFor("Subject");
    expect(subject[0]).toHaveTextContent("Mathematics");
    expect(subject[1]).toHaveTextContent("Physics");

    const format = cellsFor("File Format");
    expect(format[0]).toHaveTextContent("PDF Document");
    expect(format[1]).toHaveTextContent("PPTX Document");
    expect(format[2]).toHaveTextContent("DOCX Document");

    expect(cellsFor("Licensing Terms")[0]).toHaveTextContent("Classroom use allowed.");
  });

  it("falls back to defaults for missing attributes", async () => {
    const user = userEvent.setup();
    renderMatrix();
    await addAll(user, [essay]);
    await user.click(screen.getByRole("button", { name: /Compare Now/ }));
    const table = screen.getByRole("table");
    expect(within(table).getByText("by Anonymous")).toBeInTheDocument();
    expect(within(table).getByText("Academics")).toBeInTheDocument();
    expect(within(table).getByText("4.8")).toBeInTheDocument();
    expect(within(table).getByText(/Personal study access only/)).toBeInTheDocument();
  });

  it("fills unused columns with placeholders when fewer than 3 items", async () => {
    const user = userEvent.setup();
    renderMatrix();
    await addAll(user, [calculus]);
    await user.click(screen.getByRole("button", { name: /Compare Now/ }));
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("Select a material to add")).toHaveLength(2);
    // 5 attribute rows x 2 empty columns
    expect(within(table).getAllByText("—")).toHaveLength(10);
  });

  it("removes an item from inside the matrix", async () => {
    const user = userEvent.setup();
    renderMatrix();
    await addAll(user, [calculus, physics]);
    await user.click(screen.getByRole("button", { name: /Compare Now/ }));
    await user.click(screen.getAllByTitle("Remove item")[0]);
    const table = screen.getByRole("table");
    expect(within(table).queryByRole("heading", { name: "Calculus Notes" })).not.toBeInTheDocument();
    expect(within(table).getByRole("heading", { name: "Physics Slides" })).toBeInTheDocument();
  });

  it("closes the matrix and returns to the drawer", async () => {
    const user = userEvent.setup();
    renderMatrix();
    await addAll(user, [calculus]);
    await user.click(screen.getByRole("button", { name: /Compare Now/ }));
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close Comparison" }));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText(/1 \/ 3 selected/)).toBeInTheDocument();
  });
});
