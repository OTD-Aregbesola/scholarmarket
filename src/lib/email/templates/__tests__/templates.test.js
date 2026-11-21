import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { renderAdminReportEmail } from "../adminReport.js";
import { renderInactivityReminderEmail } from "../inactivityReminder.js";
import { renderSuspensionEmail, renderReactivationEmail } from "../suspension.js";
import {
  buildUnsubscribeUrl,
  createUnsubscribeToken,
  verifyUnsubscribeToken,
  UNSUBSCRIBE_CATEGORIES,
} from "../unsubscribe.js";

const stats = {
  weekStart: "2026-11-09T00:00:00.000Z",
  weekEnd: "2026-11-16T00:00:00.000Z",
  totalSales: 1234,
  totalRevenue: 5678.5,
  newRegistrations: 42,
  activeListings: 321,
  newMaterials: 17,
};

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-20T12:00:00.000Z"));
  process.env.NEXT_PUBLIC_APP_URL = "https://scholarmarket.test";
  process.env.JWT_SECRET = "test-secret-for-unsubscribe-signing";
});

afterAll(() => {
  vi.useRealTimers();
});

describe("email templates", () => {
  it("renders the admin report with HTML and text parts", () => {
    const email = renderAdminReportEmail(stats, { year: 2026 });
    expect(email.html).toContain("Weekly Marketplace Report");
    expect(email.text).toContain("Total completed sales");
    expect(email.html).toMatchSnapshot();
    expect(email.text).toMatchSnapshot();
  });

  it("renders the inactivity reminder with a working unsubscribe link", () => {
    const email = renderInactivityReminderEmail({
      to: "creator@example.com",
      name: "Ada",
      inactiveDays: 200,
      stats: { materialCount: 5, demotedCount: 2 },
    }, { year: 2026 });

    expect(email.html).toContain("Unsubscribe");
    expect(email.text).toContain("Unsubscribe:");
    expect(email.headers["List-Unsubscribe"]).toMatch(/^<https:\/\/scholarmarket\.test\/api\/email\/unsubscribe\?token=/);
    expect(email.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

    const token = new URL(email.unsubscribeUrl).searchParams.get("token");
    expect(verifyUnsubscribeToken(token)).toEqual({
      email: "creator@example.com",
      category: UNSUBSCRIBE_CATEGORIES.REMINDERS,
    });

    expect(email.html).toMatchSnapshot();
    expect(email.text).toMatchSnapshot();
  });

  it("renders the suspension notice with both parts and a default reason", () => {
    const email = renderSuspensionEmail({ name: "Ada", reason: "" }, { year: 2026 });
    expect(email.text).toContain("Violation of ScholarMarket community guidelines");
    expect(email.html).toContain("Your account has been suspended");
    expect(email.html).not.toContain("Unsubscribe");
    expect(email.html).toMatchSnapshot();
    expect(email.text).toMatchSnapshot();
  });

  it("renders the reactivation notice with both parts", () => {
    const email = renderReactivationEmail({ name: "Ada" }, { year: 2026 });
    expect(email.text).toContain("fully reinstated");
    expect(email.html).toContain("Your account has been reactivated");
    expect(email.html).not.toContain("Unsubscribe");
    expect(email.html).toMatchSnapshot();
    expect(email.text).toMatchSnapshot();
  });

  it("escapes user-supplied values in HTML", () => {
    const email = renderSuspensionEmail({ name: "<script>alert(1)</script>", reason: "Bad <b>act</b>" }, { year: 2026 });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("Bad &lt;b&gt;act&lt;/b&gt;");
  });
});

describe("unsubscribe tokens", () => {
  it("round-trips a valid token", () => {
    const token = createUnsubscribeToken({ email: "a@b.com", category: UNSUBSCRIBE_CATEGORIES.PRODUCT_UPDATES });
    expect(verifyUnsubscribeToken(token)).toEqual({ email: "a@b.com", category: "productUpdates" });
  });

  it("rejects tampered and malformed tokens", () => {
    const token = createUnsubscribeToken({ email: "a@b.com", category: UNSUBSCRIBE_CATEGORIES.REMINDERS });
    const [body, signature] = token.split(".");
    expect(verifyUnsubscribeToken(`${body}.${signature.slice(1)}`)).toBeNull();
    expect(verifyUnsubscribeToken("garbage")).toBeNull();
    expect(verifyUnsubscribeToken(null)).toBeNull();
  });

  it("refuses unsupported categories", () => {
    expect(() => createUnsubscribeToken({ email: "a@b.com", category: "receipts" })).toThrow(/Unsupported/);
  });

  it("builds an absolute unsubscribe URL", () => {
    const url = buildUnsubscribeUrl({ email: "a@b.com", category: UNSUBSCRIBE_CATEGORIES.REMINDERS });
    expect(url).toMatch(/^https:\/\/scholarmarket\.test\/api\/email\/unsubscribe\?token=/);
  });
});
