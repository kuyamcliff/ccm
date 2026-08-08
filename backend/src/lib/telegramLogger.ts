import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from "../config.js";

interface LogMessage {
  level: "log" | "error" | "warn" | "info";
  timestamp: string;
  message: string;
}

const logQueue: LogMessage[] = [];
let isProcessing = false;
let lastSentTime = 0;

const MIN_INTERVAL_MS = 400; // Minimum time between messages to avoid Telegram rate limiting
const BATCH_DELAY_MS = 1500; // Wait this long before sending a batch, so bursts collapse into one message
const MAX_MESSAGE_LENGTH = 3800; // Stay comfortably under Telegram's 4096 char limit
const MAX_ARG_LENGTH = 1200; // Per-argument cap so one huge object can't crowd out the rest of a batch

/**
 * Turns whatever was passed to console.log/error/... into readable text.
 * A plain JSON.stringify loses Error objects entirely (their message and
 * stack are non-enumerable, so it serializes to "{}"), which is exactly the
 * content that matters most for error logs — so those get unpacked by hand.
 */
function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) {
    return arg.stack ? arg.stack : `${arg.name}: ${arg.message}`;
  }
  if (arg === undefined) return "undefined";
  try {
    const json = JSON.stringify(
      arg,
      (_key, value) => (value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value),
      2
    );
    return json ?? String(arg);
  } catch {
    return String(arg);
  }
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      const text = formatArg(arg);
      return text.length > MAX_ARG_LENGTH ? text.slice(0, MAX_ARG_LENGTH) + "… [truncated]" : text;
    })
    .join(" ");
}

async function sendToTelegram(text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  try {
    const now = Date.now();
    const timeSinceLastSend = now - lastSentTime;
    if (timeSinceLastSend < MIN_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS - timeSinceLastSend));
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        // Plain text on purpose: log content (stack traces, JSON, file
        // paths with "<anonymous>") routinely contains characters that
        // break Telegram's HTML entity parser, which drops the message
        // with no visible symptom other than "logs stopped arriving".
      }),
    });

    lastSentTime = Date.now();

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // Use the untouched console here — routing this through the hooked
      // console.error would just re-enter the same failing send path.
      originalConsole.error(`[telegram-logger] Failed to send: ${response.status}`, errorData);
    }
  } catch (error) {
    originalConsole.error("[telegram-logger] Error sending to Telegram:", error);
  }
}

function formatLogMessage(log: LogMessage): string {
  const levelEmoji = { log: "📝", error: "❌", warn: "⚠️", info: "ℹ️" };
  return `${levelEmoji[log.level]} [${log.level.toUpperCase()}] ${log.timestamp}\n${log.message}`;
}

async function processBatch(): Promise<void> {
  if (isProcessing || logQueue.length === 0) return;
  isProcessing = true;

  try {
    while (logQueue.length > 0) {
      const batch: LogMessage[] = [];
      let totalLength = 0;

      while (logQueue.length > 0) {
        const log = logQueue[0];
        const formatted = formatLogMessage(log);
        if (totalLength + formatted.length + 5 > MAX_MESSAGE_LENGTH && batch.length > 0) break;
        batch.push(logQueue.shift()!);
        totalLength += formatted.length + 5;
      }

      if (batch.length > 0) {
        const message = batch.map(formatLogMessage).join("\n\n");
        await sendToTelegram(message);
      }

      if (logQueue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  } finally {
    isProcessing = false;
  }
}

let batchTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleProcessing(): void {
  if (batchTimeout) return;
  batchTimeout = setTimeout(() => {
    batchTimeout = null;
    processBatch();
  }, BATCH_DELAY_MS);
}

function enqueue(level: LogMessage["level"], args: unknown[]): void {
  logQueue.push({
    level,
    timestamp: new Date().toISOString(),
    message: formatArgs(args),
  });
  scheduleProcessing();
}

// Real console methods, kept so the logger's own error handling and the
// wrapped functions below can always reach the terminal/Render log stream
// even after console.* has been overridden.
const originalConsole = {
  log: console.log.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
};

export function initTelegramLogger(): void {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    originalConsole.log("[telegram-logger] Telegram logging disabled (no credentials)");
    return;
  }

  console.log = (...args: unknown[]) => {
    originalConsole.log(...args);
    enqueue("log", args);
  };
  console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    enqueue("error", args);
  };
  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    enqueue("warn", args);
  };
  console.info = (...args: unknown[]) => {
    originalConsole.info(...args);
    enqueue("info", args);
  };

  console.log("[telegram-logger] Initialized — all logs will be sent to Telegram");
}

export async function flushTelegramLogs(): Promise<void> {
  if (batchTimeout) {
    clearTimeout(batchTimeout);
    batchTimeout = null;
  }
  await processBatch();
}
