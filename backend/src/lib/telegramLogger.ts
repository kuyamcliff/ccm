import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from "../config.js";

interface LogMessage {
  level: "log" | "error" | "warn" | "info";
  timestamp: string;
  message: string;
}

const logQueue: LogMessage[] = [];
let isProcessing = false;
let lastSentTime = 0;

const MIN_INTERVAL_MS = 500; // Minimum time between messages to avoid rate limiting
const BATCH_DELAY_MS = 2000; // Wait this long before sending a batch
const MAX_MESSAGE_LENGTH = 4096; // Telegram message limit

async function sendToTelegram(text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return;
  }

  try {
    const now = Date.now();
    const timeSinceLastSend = now - lastSentTime;

    // Respect rate limiting
    if (timeSinceLastSend < MIN_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS - timeSinceLastSend));
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: "HTML",
      }),
    });

    lastSentTime = Date.now();

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[telegram-logger] Failed to send: ${response.status}`, errorData);
    }
  } catch (error) {
    console.error("[telegram-logger] Error sending to Telegram:", error);
  }
}

function formatLogMessage(log: LogMessage): string {
  const levelEmoji = {
    log: "📝",
    error: "❌",
    warn: "⚠️",
    info: "ℹ️",
  };

  return `${levelEmoji[log.level]} [${log.level.toUpperCase()}] ${log.timestamp}\n${log.message}`;
}

async function processBatch(): Promise<void> {
  if (isProcessing || logQueue.length === 0) {
    return;
  }

  isProcessing = true;

  try {
    while (logQueue.length > 0) {
      const batch: LogMessage[] = [];
      let totalLength = 0;

      // Collect logs until we reach message size limit or empty queue
      while (logQueue.length > 0) {
        const log = logQueue[0];
        const formatted = formatLogMessage(log);

        if (totalLength + formatted.length + 1 > MAX_MESSAGE_LENGTH && batch.length > 0) {
          break;
        }

        batch.push(logQueue.shift()!);
        totalLength += formatted.length + 1;
      }

      if (batch.length > 0) {
        const message = batch.map(formatLogMessage).join("\n---\n");
        await sendToTelegram(message);
      }

      // Small delay between batches to avoid overwhelming Telegram API
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
  if (batchTimeout) {
    return;
  }

  batchTimeout = setTimeout(() => {
    batchTimeout = null;
    processBatch();
  }, BATCH_DELAY_MS);
}

export function initTelegramLogger(): void {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("[telegram-logger] Telegram logging disabled (no credentials)");
    return;
  }

  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;

  console.log = function (...args: any[]) {
    originalLog.apply(console, args);
    const message = args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ");
    logQueue.push({
      level: "log",
      timestamp: new Date().toISOString(),
      message: message.substring(0, 500),
    });
    scheduleProcessing();
  };

  console.error = function (...args: any[]) {
    originalError.apply(console, args);
    const message = args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ");
    logQueue.push({
      level: "error",
      timestamp: new Date().toISOString(),
      message: message.substring(0, 500),
    });
    scheduleProcessing();
  };

  console.warn = function (...args: any[]) {
    originalWarn.apply(console, args);
    const message = args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ");
    logQueue.push({
      level: "warn",
      timestamp: new Date().toISOString(),
      message: message.substring(0, 500),
    });
    scheduleProcessing();
  };

  console.info = function (...args: any[]) {
    originalInfo.apply(console, args);
    const message = args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ");
    logQueue.push({
      level: "info",
      timestamp: new Date().toISOString(),
      message: message.substring(0, 500),
    });
    scheduleProcessing();
  };

  console.log("[telegram-logger] Initialized - all logs will be sent to Telegram");
}

export async function flushTelegramLogs(): Promise<void> {
  if (batchTimeout) {
    clearTimeout(batchTimeout);
    batchTimeout = null;
  }
  await processBatch();
}
