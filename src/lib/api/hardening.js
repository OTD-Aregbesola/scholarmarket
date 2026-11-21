import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auditLog } from "./audit";
import { checkRateLimit } from "./rateLimit";
import { ValidationError } from "./validation";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import { DEFAULT_JSON_LIMIT, installJsonBodyLimit } from "./jsonBody";

function clientKey(request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

export async function withApiHardening(request, options, handler) {
  const route = options.route;
  const method = request.method || "GET";
  const requestId = request.headers.get("x-request-id") || randomUUID();
  const identity = options.key ? await options.key(request) : clientKey(request);
  const rateLimit = checkRateLimit(`${route}:${method}:${identity}`, options.rateLimit);
  const requestLogger = logger.child({ requestId, route, method });

  if (["POST", "PUT", "PATCH"].includes(method) && request.headers.get("content-type")?.includes("application/json")) {
    const maxBytes = options.maxJsonBytes || DEFAULT_JSON_LIMIT;
    installJsonBodyLimit(request, { maxBytes });
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return NextResponse.json({ type: "about:blank", title: "Payload too large", status: 413 }, { status: 413, headers: { "X-Request-ID": requestId } });
    }
  }

  if (!rateLimit.allowed) {
    requestLogger.warn({ requestId, identity: identity === "local" ? undefined : identity }, "Rate limit exceeded");
    auditLog({ event: "rate_limit_blocked", route, method, status: 429 });
    const response = NextResponse.json(
      { error: "Too many requests", retryAfter: rateLimit.retryAfter },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfter),
          "X-Request-ID": requestId,
        },
      }
    );
    return response;
  }

  try {
    const response = await handler(requestLogger);
    if (response?.headers) response.headers.set("x-request-id", requestId);
    return response;
  } catch (error) {
    if (error?.status === 413) {
      return NextResponse.json({ type: "about:blank", title: "Payload too large", status: 413 }, { status: 413, headers: { "X-Request-ID": requestId } });
    }
    if (error instanceof ValidationError) {
      auditLog({ event: "validation_failed", route, method, status: 400, reason: error.message });
      return NextResponse.json({ error: error.message, details: error.details }, { status: 400 });
    }

    requestLogger.error({ err: error, requestId }, "Unhandled hardened API request error");
    captureException(error, { route, method });
    throw error;
  }
}
