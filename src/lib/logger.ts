/**
 * Structured logger for D.scribe API routes.
 * Uses pino with async transports — non-blocking I/O.
 *
 * Transport strategy:
 *   development  → pino-pretty (console) + file (logs/app.log)
 *   production   → @axiomhq/pino (if AXIOM_TOKEN set) + file (logs/app.log)
 *
 * Graceful degradation: falls back to file + console when cloud tokens are absent.
 * Do NOT import this in middleware.ts or any Edge Runtime file.
 */

import pino from "pino";
import path from "path";
import fs from "fs";

const IS_VERCEL = !!process.env.VERCEL;
const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");

if (!IS_VERCEL && !fs.existsSync(LOG_DIR)) {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch { /* read-only fs */ }
}

// ---------------------------------------------------------------------------
// Public types — kept identical to old logger so callers need no changes
// ---------------------------------------------------------------------------

export interface LogEntry {
  timestamp: string;
  level: "error" | "warn" | "info";
  route?: string;
  userId?: string;
  message: string;
  error?: string;
  stack?: string;
  meta?: object;
}

export interface LogOptions {
  route?: string;
  userId?: string;
  error?: unknown;
  meta?: object;
}

// ---------------------------------------------------------------------------
// Transport assembly
// ---------------------------------------------------------------------------

function buildTransports(): pino.TransportMultiOptions | pino.TransportSingleOptions | undefined {
  const isDev = process.env.NODE_ENV !== "production";

  // File transport — only usable on local (Vercel filesystem is read-only)
  const fileTransport: pino.TransportTargetOptions | null = IS_VERCEL ? null : {
    target: "pino/file",
    level: "info",
    options: { destination: LOG_FILE, append: true, mkdir: true },
  };

  if (isDev) {
    const prettyTransport: pino.TransportTargetOptions = {
      target: "pino-pretty",
      level: "info",
      options: {
        colorize: true,
        translateTime: "SYS:HH:MM:ss",
        ignore: "pid,hostname",
        messageFormat: "{route} {msg}",
      },
    };
    const targets = fileTransport ? [prettyTransport, fileTransport] : [prettyTransport];
    return { targets };
  }

  // Production: Axiom (if configured) + file (if available)
  const axiomToken = process.env.AXIOM_TOKEN;
  const axiomDataset = process.env.AXIOM_DATASET;

  if (!axiomToken) {
    if (!fileTransport) return undefined; // Vercel + no Axiom → pino stdout only
    return { targets: [fileTransport] };
  }

  const axiomTransport: pino.TransportTargetOptions = {
    target: "@axiomhq/pino",
    level: "info",
    options: {
      token: axiomToken,
      dataset: axiomDataset ?? "dscribe-logs",
    },
  };

  const targets = fileTransport ? [axiomTransport, fileTransport] : [axiomTransport];
  return { targets };
}

// ---------------------------------------------------------------------------
// Pino instance
// pino.transport() spawns worker threads by default on Node >=18. Using the
// `worker: false` option is not exposed in pino's public API — instead we
// rely on the multi-transport path which is stable in Next.js API routes.
// The transport is fully async; no blocking I/O on the request thread.
// ---------------------------------------------------------------------------

const transport = buildTransports();

const pinoLogger = pino(
  {
    level: "info",
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  },
  transport ? pino.transport(transport) : undefined
);

// ---------------------------------------------------------------------------
// Adapter — converts LogOptions to pino bindings so callers need zero changes
// ---------------------------------------------------------------------------

function buildBindings(opts: LogOptions): Record<string, unknown> {
  const bindings: Record<string, unknown> = {};

  if (opts.route) bindings.route = opts.route;
  if (opts.userId) bindings.userId = opts.userId;
  if (opts.meta) bindings.meta = opts.meta;

  if (opts.error != null) {
    if (opts.error instanceof Error) {
      bindings.error = opts.error.message;
      if (opts.error.stack) bindings.stack = opts.error.stack;
    } else if (typeof opts.error === "object") {
      // supabase-js never throws — it returns plain { message, details, hint,
      // code } objects. String() rendered every one as "[object Object]",
      // which blanked the exact failures most worth reading (webhook logging,
      // account deletion, edit-event capture). Unwrap the useful fields.
      const e = opts.error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
      if (typeof e.message === "string" && e.message) {
        bindings.error = e.message;
        if (e.code != null) bindings.errorCode = e.code;
        if (typeof e.details === "string" && e.details) bindings.errorDetails = e.details;
        if (typeof e.hint === "string" && e.hint) bindings.errorHint = e.hint;
      } else {
        try {
          bindings.error = JSON.stringify(opts.error).slice(0, 2000);
        } catch {
          bindings.error = String(opts.error);
        }
      }
    } else {
      bindings.error = String(opts.error);
    }
  }

  return bindings;
}

// ---------------------------------------------------------------------------
// Public logger — same interface as the old appendFileSync logger
// ---------------------------------------------------------------------------

export const logger = {
  error(message: string, opts: LogOptions = {}): void {
    pinoLogger.error(buildBindings(opts), message);
  },
  warn(message: string, opts: LogOptions = {}): void {
    pinoLogger.warn(buildBindings(opts), message);
  },
  info(message: string, opts: LogOptions = {}): void {
    pinoLogger.info(buildBindings(opts), message);
  },
};
