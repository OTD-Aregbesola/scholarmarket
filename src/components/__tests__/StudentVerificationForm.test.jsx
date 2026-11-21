import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import StudentVerificationForm from "../StudentVerificationForm";

expect.extend(toHaveNoViolations);

const ENDPOINT = "/api/verification/student";

let submittedBody = "";
let submitCount = 0;
let responseStatus = 200;
let responseBody = { verificationId: "ver-123", status: "pending" };
let delayMs = 0;

const server = setupServer(
  http.post(ENDPOINT, async ({ request }) => {
    submitCount += 1;
    submittedBody = Buffer.from(await request.arrayBuffer()).toString("utf8");
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return HttpResponse.json(responseBody, { status: responseStatus });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  submittedBody = "";
  submitCount = 0;
  responseStatus = 200;
  responseBody = { verificationId: "ver-123", status: "pending" };
  delayMs = 0;
});
afterAll(() => server.close());

function submitForm() {
  // fireEvent.submit bypasses the browser's native email constraint check so
  // that the component's own validation (the subject under test) runs.
  fireEvent.submit(screen.getByRole("button", { name: /submit verification application/i }).closest("form"));
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Ada Okafor" } });
  fireEvent.change(screen.getByLabelText(/student email/i), { target: { value: "ada@university.edu" } });
  fireEvent.change(screen.getByLabelText(/institution name/i), { target: { value: "University of Example" } });
  fireEvent.change(screen.getByLabelText(/student id/i), { target: { value: "S123456789" } });
  fireEvent.change(screen.getByLabelText(/expected graduation/i), { target: { value: "2027-06" } });
  fireEvent.change(document.getElementById("document-upload"), {
    target: { files: [new File(["%PDF-1.4 document"], "student-id.pdf", { type: "application/pdf" })] },
  });
}

describe("StudentVerificationForm", () => {
  it("requires every field and does not submit an empty form", async () => {
    render(<StudentVerificationForm userAddress="GCUSTOMER" />);

    submitForm();

    expect(await screen.findByText("Full name is required")).toBeInTheDocument();
    expect(screen.getByText("Email is required")).toBeInTheDocument();
    expect(screen.getByText("Institution name is required")).toBeInTheDocument();
    expect(screen.getByText("Student ID is required")).toBeInTheDocument();
    expect(screen.getByText("Expected graduation date is required")).toBeInTheDocument();
    expect(screen.getByText("Please upload a verification document")).toBeInTheDocument();
    expect(submitCount).toBe(0);
  });

  it("rejects an email without a top-level domain without calling the API", async () => {
    render(<StudentVerificationForm userAddress="GCUSTOMER" />);
    fillValidForm();
    // Natively valid but fails the component's stricter /@.+/ contract.
    fireEvent.change(screen.getByLabelText(/student email/i), { target: { value: "ada@university" } });

    submitForm();

    expect(await screen.findByText("Invalid email format")).toBeInTheDocument();
    expect(submitCount).toBe(0);
  });

  it.each([
    ["text/plain", "student-id.txt", "Invalid file type"],
    ["application/pdf", "oversized.pdf", "exceeds the 5MB limit"],
  ])("rejects a %s document", async (type, name, message) => {
    render(<StudentVerificationForm userAddress="GCUSTOMER" />);
    const size = type === "application/pdf" ? 6 * 1024 * 1024 : 1024;
    const contents = type === "application/pdf" ? new Uint8Array(size) : "not a document";

    fireEvent.change(document.getElementById("document-upload"), {
      target: { files: [new File([contents], name, { type })] },
    });

    expect(await screen.findByText(new RegExp(message, "i"))).toBeInTheDocument();
  });

  it("submits the documented payload, shows a pending state and calls onSuccess", async () => {
    const onSuccess = vi.fn();
    delayMs = 50;
    render(<StudentVerificationForm userAddress="GCUSTOMER" onSuccess={onSuccess} />);
    fillValidForm();

    submitForm();

    expect(screen.getByRole("button", { name: /submitting/i })).toBeDisabled();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(responseBody));

    // Verify the multipart contract the /api/verification/student route expects.
    expect(submittedBody).toContain('name="walletAddress"');
    expect(submittedBody).toContain("GCUSTOMER");
    expect(submittedBody).toContain('name="fullName"');
    expect(submittedBody).toContain("Ada Okafor");
    expect(submittedBody).toContain('name="email"');
    expect(submittedBody).toContain("ada@university.edu");
    expect(submittedBody).toContain('name="institution"');
    expect(submittedBody).toContain("University of Example");
    expect(submittedBody).toContain('name="studentId"');
    expect(submittedBody).toContain("S123456789");
    expect(submittedBody).toContain('name="expectedGraduation"');
    expect(submittedBody).toContain("2027-06");
    expect(submittedBody).toContain('name="document"');
    // jsdom's File serialises with a generic filename, but the multipart part
    // and its PDF content type confirm the document field is on the contract.
    expect(submittedBody).toMatch(/name="document"; filename="[^"]+"/);
    expect(submittedBody).toContain("application/pdf");
    expect(screen.getByRole("button", { name: /submit verification application/i })).toBeEnabled();
  });

  it("shows a server error and clears the pending state", async () => {
    responseStatus = 500;
    responseBody = { error: "Document could not be read" };
    render(<StudentVerificationForm userAddress="GCUSTOMER" />);
    fillValidForm();

    submitForm();

    expect(await screen.findByText("Document could not be read")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit verification application/i })).toBeEnabled();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<StudentVerificationForm userAddress="GCUSTOMER" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
