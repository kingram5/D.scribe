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

// Ensure logs/ directory exists at module load time
const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
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

  // File transport target — always present
  const fileTransport: pino.TransportTargetOptions = {
    target: "pino/file",
    level: "info",
    options: { destination: LOG_FILE, append: true, mkdir: true },
  };

  if (isDev) {
    // Development: pretty console + file
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
    return {
      targets: [prettyTransport, fileTransport],
    };
  }

  // Production: Axiom (if configured) + file
  const axiomToken = process.env.AXIOM_TOKEN;
  const axiomDataset = process.env.AXIOM_DATASET;

  if (!axiomToken) {
    // Warn once at startup — still write to file
    console.warn("[logger] AXIOM_TOKEN not set — skipping Axiom transport, writing to file only");
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

  return {
    targets: [axiomTransport, fileTransport],
  };
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
