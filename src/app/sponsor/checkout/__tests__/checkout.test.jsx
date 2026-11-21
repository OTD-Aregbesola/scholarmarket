import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BulkAddressInput from "../BulkAddressInput";
import GasEstimator from "../GasEstimator";

describe("sponsor checkout inputs", () => {
  it("splits, trims and deduplicates pasted addresses", () => {
    const onChange = vi.fn();
    render(<BulkAddressInput onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: " GABC\nGABC, GDEF " } });
    expect(onChange).toHaveBeenLastCalledWith(["GABC", "GDEF"]);
  });

  it("calculates and formats fee estimates to seven decimals", () => {
    render(<GasEstimator totalTx={3} />);
    expect(screen.getByText(/0\.0000300 XLM/)).toBeInTheDocument();
  });
});
