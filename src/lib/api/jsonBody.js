import { NextResponse } from "next/server";

export const DEFAULT_JSON_LIMIT = 100 * 1024;

export function installJsonBodyLimit(request, { maxBytes = DEFAULT_JSON_LIMIT } = {}) {
  const originalJson = request.json.bind(request);
  Object.defineProperty(request, "json", {
    configurable: true,
    value: async () => {
      const reader = request.body?.getReader();
      if (!reader) return originalJson();
      const chunks = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) {
            await reader.cancel();
            const error = new Error("Payload too large");
            error.status = 413;
            throw error;
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error("Invalid JSON"); }
    },
  });
}

export async function readJsonBody(request, { maxBytes = DEFAULT_JSON_LIMIT } = {}) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { error: NextResponse.json({ type: "about:blank", title: "Payload too large", status: 413 }, { status: 413 }) };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return { error: NextResponse.json({ type: "about:blank", title: "Payload too large", status: 413 }, { status: 413 }) };
  }
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: NextResponse.json({ type: "about:blank", title: "Invalid JSON", status: 400 }, { status: 400 }) };
  }
}
