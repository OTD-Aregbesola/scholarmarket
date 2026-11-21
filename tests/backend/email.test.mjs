/**
 * Tests for email senders in src/lib/email/:
 *   - adminReport.js (sendWeeklyAdminReport)
 *   - inactivityReminder.js (sendInactivityReminder)
 *   - suspensionNotifier.js (sendSuspensionEmail, sendReactivationEmail)
 *
 * Uses a Nodemailer jsonTransport-style mock via node:module registerHooks.
 * No real SMTP connection is ever opened.
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { registerHooks } from "node:module";

// ── Mock Nodemailer jsonTransport ─────────────────────────────────────────────

const sentMessages = [];
let nextTransportError = null;

const mockNodemailer = {
  createTransport(_config) {
    return {
      async sendMail(mailOptions) {
        if (nextTransportError) {
          const err = nextTransportError;
          nextTransportError = null;
          throw err;
        }
        const serialized = JSON.stringify({
          from: mailOptions.from,
          to: mailOptions.to,
          subject: mailOptions.subject,
          text: mailOptions.text,
          html: mailOptions.html,
        });
        sentMessages.push(JSON.parse(serialized));
        return {
          envelope: { from: mailOptions.from, to: [mailOptions.to] },
          messageId: `<mock-${sentMessages.length}@scholarmarket.local>`,
          message: serialized,
        };
      },
    };
  },
};

globalThis.__EMAIL_TEST_NODEMAILER__ = mockNodemailer;
globalThis.__EMAIL_TEST_DB__ = {
  collection() {
    throw new Error("Unexpected real DB call in email unit tests");
  },
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "nodemailer") {
      return { shortCircuit: true, url: "virtual:mock-nodemailer" };
    }
    if (specifier === "@/lib/mongodb") {
      return { shortCircuit: true, url: "virtual:mock-email-mongodb" };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "virtual:mock-nodemailer") {
      return {
        shortCircuit: true,
        format: "module",
        source: `export default globalThis.__EMAIL_TEST_NODEMAILER__;`,
      };
    }
    if (url === "virtual:mock-email-mongodb") {
      return {
        shortCircuit: true,
        format: "module",
        source: `export async function getDb() { return globalThis.__EMAIL_TEST_DB__; }`,
      };
    }
    return nextLoad(url, context);
  },
});

const { sendWeeklyAdminReport } = await import("../../src/lib/email/adminReport.js");
const { sendInactivityReminder } = await import("../../src/lib/email/inactivityReminder.js");
const { sendSuspensionEmail, sendReactivationEmail } = await import(
  "../../src/lib/email/suspensionNotifier.js"
);

// ── Helpers ───────────────────────────────────────────────────────────────────

const originalEnv = { ...process.env };
const originalConsoleError = console.error;

describe("Email senders (mock jsonTransport)", () => {
  let loggedErrors;

  beforeEach(() => {
    sentMessages.length = 0;
    nextTransportError = null;
    loggedErrors = [];
    console.error = (...args) => {
      loggedErrors.push(args);
    };
    process.env.SMTP_HOST = "mock.smtp.local";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "sender@scholarmarket.local";
    process.env.SMTP_PASS = "test-pass";
    process.env.EMAIL_FROM = "no-reply@scholarmarket.local";
    process.env.ADMIN_REPORT_EMAILS = "admin1@scholarmarket.local, admin2@scholarmarket.local";
    process.env.NEXT_PUBLIC_APP_URL = "https://scholarmarket.test";
  });

  afterEach(() => {
    console.error = originalConsoleError;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  // ── adminReport.js ──────────────────────────────────────────────────────────

  describe("sendWeeklyAdminReport", () => {
    const sampleStats = {
      weekStart: "2026-11-09T00:00:00.000Z",
      weekEnd: "2026-11-16T00:00:00.000Z",
      totalSales: 42,
      totalRevenue: 1250.5,
      newRegistrations: 18,
      activeListings: 310,
      newMaterials: 9,
    };

    it("sends weekly report with expected recipients, subject, and stats body", async () => {
      const result = await sendWeeklyAdminReport(sampleStats);

      assert.deepEqual(result.delivered, [
        "admin1@scholarmarket.local",
        "admin2@scholarmarket.local",
      ]);
      assert.equal(sentMessages.length, 1);

      const msg = sentMessages[0];
      assert.equal(msg.to, "admin1@scholarmarket.local, admin2@scholarmarket.local");
      assert.equal(msg.subject, "ScholarMarket Weekly Report — w/c 2026-11-09");
      assert.match(msg.text, /Total completed sales\s*:\s*42/);
      assert.match(msg.text, /Total revenue \(XLM\)\s*:\s*1250\.5/);
      assert.match(msg.html, /Weekly Marketplace Report/);
      assert.match(msg.html, /1,250\.5/);
      assert.match(msg.html, /https:\/\/scholarmarket\.test\/admin/);
    });

    it("logs transport errors and does not crash caller", async () => {
      nextTransportError = new Error("SMTP connection refused");

      const result = await sendWeeklyAdminReport(sampleStats);

      assert.deepEqual(result.delivered, []);
      assert.equal(result.error, "SMTP connection refused");
      assert.equal(loggedErrors.length, 1);
      assert.match(String(loggedErrors[0][0]), /adminReport/);
    });
  });

  // ── inactivityReminder.js ───────────────────────────────────────────────────

  describe("sendInactivityReminder", () => {
    it("sends reminder with expected recipient, subject, and catalog stats", async () => {
      const result = await sendInactivityReminder(
        "creator@example.com",
        "Dr. Ada",
        195,
        { materialCount: 7, demotedCount: 2 }
      );

      assert.equal(result.sent, true);
      assert.equal(sentMessages.length, 1);

      const msg = sentMessages[0];
      assert.equal(msg.to, "creator@example.com");
      assert.equal(
        msg.subject,
        "Your ScholarMarket catalog needs attention — 195 days inactive"
      );
      assert.match(msg.text, /Hi Dr\. Ada,/);
      assert.match(msg.text, /2 of your 7 catalog item\(s\)/);
      assert.match(msg.html, /195 days/);
      assert.match(msg.html, /https:\/\/scholarmarket\.test\/dashboard/);
    });

    it("escapes HTML in user-provided creator name", async () => {
      const xssName = '<script>alert("xss")</script> & Co.';
      await sendInactivityReminder("creator@example.com", xssName, 180, {
        materialCount: 3,
        demotedCount: 0,
      });

      assert.equal(sentMessages.length, 1);
      const { html } = sentMessages[0];
      assert.ok(!html.includes("<script>"), "Raw <script> tag must not appear in HTML");
      assert.ok(
        html.includes("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; Co."),
        "Creator name must be HTML-escaped"
      );
    });

    it("logs transport errors and does not crash caller", async () => {
      nextTransportError = new Error("Mailbox unavailable");

      const result = await sendInactivityReminder(
        "creator@example.com",
        "Dr. Ada",
        185,
        { materialCount: 1, demotedCount: 0 }
      );

      assert.equal(result.sent, false);
      assert.equal(result.error, "Mailbox unavailable");
      assert.equal(loggedErrors.length, 1);
      assert.match(String(loggedErrors[0][0]), /inactivityReminder/);
    });
  });

  // ── suspensionNotifier.js ───────────────────────────────────────────────────

  describe("sendSuspensionEmail", () => {
    it("sends suspension notice with expected recipient, subject, reason, and appeal email", async () => {
      const result = await sendSuspensionEmail({
        to: "user@example.com",
        name: "Jane Doe",
        reason: "Repeated copyright violations",
        appealEmail: "appeals@scholarmarket.test",
      });

      assert.equal(result.sent, true);
      assert.equal(sentMessages.length, 1);

      const msg = sentMessages[0];
      assert.equal(msg.to, "user@example.com");
      assert.equal(msg.subject, "Important: Your ScholarMarket account has been suspended");
      assert.match(msg.text, /Hi Jane Doe,/);
      assert.match(msg.text, /Repeated copyright violations/);
      assert.match(msg.text, /appeals@scholarmarket\.test/);
      assert.match(msg.html, /Your account has been suspended/);
      assert.match(msg.html, /Repeated copyright violations/);
    });

    it("escapes HTML in user-provided name and suspension reason", async () => {
      await sendSuspensionEmail({
        to: "user@example.com",
        name: '<img src=x onerror="alert(1)">',
        reason: '<b>Spam</b> & <script>steal()</script>',
      });

      assert.equal(sentMessages.length, 1);
      const { html } = sentMessages[0];
      assert.ok(!html.includes("<img src=x"), "Raw <img> tag must not appear in HTML");
      assert.ok(!html.includes("<script>steal()"), "Raw <script> tag must not appear in HTML");
      assert.ok(
        html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"),
        "Name must be HTML-escaped"
      );
      assert.ok(
        html.includes("&lt;b&gt;Spam&lt;/b&gt; &amp; &lt;script&gt;steal()&lt;/script&gt;"),
        "Reason must be HTML-escaped"
      );
    });

    it("logs transport errors and does not crash caller", async () => {
      nextTransportError = new Error("TLS handshake failed");

      const result = await sendSuspensionEmail({
        to: "user@example.com",
        name: "Jane Doe",
        reason: "Policy violation",
      });

      assert.equal(result.sent, false);
      assert.equal(result.error, "TLS handshake failed");
      assert.equal(loggedErrors.length, 1);
      assert.match(String(loggedErrors[0][0]), /suspensionNotifier/);
    });
  });

  describe("sendReactivationEmail", () => {
    it("sends reactivation notice with expected recipient, subject, and body", async () => {
      const result = await sendReactivationEmail({
        to: "user@example.com",
        name: "Jane Doe",
      });

      assert.equal(result.sent, true);
      assert.equal(sentMessages.length, 1);

      const msg = sentMessages[0];
      assert.equal(msg.to, "user@example.com");
      assert.equal(msg.subject, "Good news: Your ScholarMarket account has been reactivated");
      assert.match(msg.text, /Hi Jane Doe,/);
      assert.match(msg.text, /fully reinstated/);
      assert.match(msg.html, /Your account has been reactivated/);
      assert.match(msg.html, /https:\/\/scholarmarket\.test\/dashboard/);
    });

    it("escapes HTML in user-provided name", async () => {
      await sendReactivationEmail({
        to: "user@example.com",
        name: "O'Connor <admin>",
      });

      assert.equal(sentMessages.length, 1);
      const { html } = sentMessages[0];
      assert.ok(!html.includes("<admin>"), "Raw <admin> tag must not appear in HTML");
      assert.ok(
        html.includes("O&#39;Connor &lt;admin&gt;"),
        "Name must be HTML-escaped"
      );
    });

    it("logs transport errors and does not crash caller", async () => {
      nextTransportError = new Error("SMTP timeout");

      const result = await sendReactivationEmail({
        to: "user@example.com",
        name: "Jane Doe",
      });

      assert.equal(result.sent, false);
      assert.equal(result.error, "SMTP timeout");
      assert.equal(loggedErrors.length, 1);
      assert.match(String(loggedErrors[0][0]), /suspensionNotifier/);
    });
  });
});
