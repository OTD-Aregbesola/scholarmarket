import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TransactionStatusPanel from "../TransactionStatusPanel";
import { TransactionStatus, TransactionTone } from "@/lib/transactions/transaction";

const transaction = (status, patch = {}) => ({
  status,
  tone: TransactionTone.Info,
  scope: "checkout",
  title: "Transaction",
  message: "Working",
  retryable: false,
  ...patch,
});

describe("TransactionStatusPanel", () => {
  it.each([
    [TransactionStatus.WaitingWallet, "Waiting for wallet approval"],
    [TransactionStatus.Confirmed, "Transaction confirmed"],
    [TransactionStatus.Failed, "Transaction failed"],
  ])("renders the %s status", (status, label) => {
    render(<TransactionStatusPanel transaction={transaction(status)} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("renders retry and clear actions", async () => {
    const onRetry = vi.fn();
    const onClear = vi.fn();
    render(<TransactionStatusPanel transaction={transaction(TransactionStatus.NeedsRetry, { retryable: true })} onRetry={onRetry} onClear={onClear} />);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });
});
