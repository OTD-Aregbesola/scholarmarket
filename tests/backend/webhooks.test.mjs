/**
 * Outbound webhook delivery tests (sender.js and discord.js).
 *
 * MSW intercepts every request; onUnhandledRequest "error" fails the test if a
 * request is not matched, so nothing leaves the process. Retry timing uses
 * node:test fake timers.
 */
import assert from "node:assert/strict";
import { describe, it, before, after, afterEach } from "node:test";
import { mock } from "node:test";
import { register } from "node:module";
try {
  register("../../test/alias-loader.mjs", import.meta.url);
} catch {}

import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

// Keep the logger quiet so the test output stays readable.
process.env.LOG_LEVEL = "silent";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:1/unused";

const { sendWebhookWithRetry } = await import("../../src/lib/webhooks/sender.js");
const { sendDiscordWebhook, createStatsEmbed } = await import("../../src/lib/webhooks/discord.js");

const SENDER_URL = "https://hooks.example.test/webhook";
const DISCORD_URL = "https://discord.example.test/api/webhooks/1/token";

const server = setupServer();

before(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  mock.timers.reset();
});
after(() => server.close());

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};

// Registers a handler that answers with the given statuses in order (last repeats).
function respondWith(url, statuses) {
  const calls = [];
  server.use(
    http.post(url, async ({ request }) => {
      calls.push({
        headers: Object.fromEntries(request.headers),
        body: await request.text(),
      });
      const status = statuses[Math.min(calls.length - 1, statuses.length - 1)];
      return new HttpResponse(null, { status });
    })
  );
  return calls;
}

// Registers a handler that never answers until the request is aborted.
function hang(url) {
  const calls = [];
  calls.aborted = 0;
  server.use(
    http.post(url, ({ request }) => {
      calls.push(request.url);
      return new Promise((_, reject) => {
        request.signal.addEventListener("abort", () => {
          calls.aborted += 1;
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    })
  );
  return calls;
}

const senders = [
  { name: "sendWebhookWithRetry", fn: sendWebhookWithRetry, url: SENDER_URL, timeout: 5000 },
  { name: "sendDiscordWebhook", fn: sendDiscordWebhook, url: DISCORD_URL, timeout: 10000 },
];

describe("webhook payload and headers", () => {
  it("sendWebhookWithRetry posts the JSON payload with its headers", async () => {
    const calls = respondWith(SENDER_URL, [200]);
    const payload = { event: "purchase", amount: 12.5, nested: { id: "m1" } };
    assert.equal(await sendWebhookWithRetry(SENDER_URL, payload), true);
    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(calls[0].body), payload);
    assert.match(calls[0].headers["content-type"], /^application\/json/);
    assert.equal(calls[0].headers["user-agent"], "ScholarMarket-Webhook-Sender/1.0");
  });

  it("sendDiscordWebhook posts the JSON payload with a JSON content type", async () => {
    const calls = respondWith(DISCORD_URL, [204]);
    const payload = createStatsEmbed({ volume: 1, totalSales: 2, signups: 3, activeMaterials: 4 });
    assert.equal(await sendDiscordWebhook(DISCORD_URL, payload), true);
    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(calls[0].body), payload);
    assert.match(calls[0].headers["content-type"], /^application\/json/);
  });
});

for (const { name, fn, url, timeout } of senders) {
  describe(`${name} retry behaviour`, () => {
    it("retries 500 with 1 s then 2 s backoff and returns true on success", async () => {
      const calls = respondWith(url, [500, 500, 200]);
      mock.timers.enable({ apis: ["setTimeout"] });
      const result = fn(url, { a: 1 });
      await flush();
      assert.equal(calls.length, 1);
      mock.timers.tick(999);
      await flush();
      assert.equal(calls.length, 1, "no retry before 1 s");
      mock.timers.tick(1);
      await flush();
      assert.equal(calls.length, 2, "second attempt after 1 s");
      mock.timers.tick(1999);
      await flush();
      assert.equal(calls.length, 2, "no third attempt before 2 s");
      mock.timers.tick(1);
      await flush();
      assert.equal(calls.length, 3, "third attempt after 2 s");
      assert.equal(await result, true);
    });

    it("makes exactly 3 attempts when every response is 500, then returns false", async () => {
      const calls = respondWith(url, [500]);
      mock.timers.enable({ apis: ["setTimeout"] });
      const result = fn(url, { a: 1 });
      await flush();
      mock.timers.tick(1000);
      await flush();
      mock.timers.tick(2000);
      await flush();
      assert.equal(await result, false);
      assert.equal(calls.length, 3);
    });

    it("aborts a hanging request after the timeout and retries", async () => {
      const calls = hang(url);
      mock.timers.enable({ apis: ["setTimeout"] });
      const result = fn(url, { a: 1 }, 2);
      await flush();
      assert.equal(calls.length, 1);
      mock.timers.tick(timeout - 1);
      await flush();
      assert.equal(calls.aborted, 0, "not aborted before the timeout");
      mock.timers.tick(1);
      await flush();
      assert.equal(calls.aborted, 1, "aborted at the timeout");
      assert.equal(calls.length, 1, "no retry before the 1 s backoff");
      mock.timers.tick(1000);
      await flush();
      assert.equal(calls.length, 2, "retry follows the abort");
      mock.timers.tick(timeout);
      await flush();
      assert.equal(await result, false);
      assert.equal(calls.aborted, 2);
      assert.equal(calls.length, 2);
    });

    for (const status of [400, 401, 404]) {
      it(`does not retry ${status}`, async () => {
        const calls = respondWith(url, [status]);
        assert.equal(await fn(url, { a: 1 }), false);
        assert.equal(calls.length, 1);
      });
    }

    for (const status of [408, 429]) {
      it(`retries ${status}`, async () => {
        const calls = respondWith(url, [status, 200]);
        mock.timers.enable({ apis: ["setTimeout"] });
        const result = fn(url, { a: 1 });
        await flush();
        mock.timers.tick(1000);
        await flush();
        assert.equal(await result, true);
        assert.equal(calls.length, 2);
      });
    }
  });
}

describe("createStatsEmbed", () => {
  it("formats the embed", () => {
    const { embeds } = createStatsEmbed({ volume: 1234.5, totalSales: 7, signups: 3, activeMaterials: 42 });
    assert.equal(embeds.length, 1);
    const e = embeds[0];
    assert.equal(e.color, 0x00bfff);
    assert.equal(new Date(e.timestamp).toISOString(), e.timestamp);
    assert.deepEqual(
      e.fields.map((f) => [f.name, f.value, f.inline]),
      [
        ["Sales Volume (24h)", "$1234.50", true],
        ["Total Sales", "7", true],
        ["New Signups", "3", true],
        ["Active Materials", "42", true],
      ]
    );
  });

  it("defaults missing stats to 0", () => {
    const { embeds } = createStatsEmbed({});
    assert.deepEqual(
      embeds[0].fields.map((f) => f.value),
      ["$0", "0", "0", "0"]
    );
  });

  it("stays within Discord embed limits, even with very large numbers", () => {
    const { embeds } = createStatsEmbed({
      volume: 9.99e15,
      totalSales: Number.MAX_SAFE_INTEGER,
      signups: Number.MAX_SAFE_INTEGER,
      activeMaterials: Number.MAX_SAFE_INTEGER,
    });
    const e = embeds[0];
    assert.ok(embeds.length <= 10);
    assert.ok(e.title.length <= 256);
    assert.ok(e.fields.length <= 25);
    let total = e.title.length + e.footer.text.length;
    for (const f of e.fields) {
      assert.ok(f.name.length <= 256);
      assert.ok(f.value.length <= 1024);
      total += f.name.length + f.value.length;
    }
    assert.ok(e.footer.text.length <= 2048);
    assert.ok(total <= 6000);
  });
});
