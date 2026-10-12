import type { RuntimeConfig } from './cliArgs.js';

// Transport-level error codes that mean the request never reached Google
// (or the connection died before a response) — safe to retry for any method.
const RETRYABLE_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE']);
// 429 rate-limit and 503/504 gateway errors; 500/502 deliberately excluded
// (see utils/retry.ts — a 5xx after the request reached the server may mean
// it was partially applied).
const RETRYABLE_STATUS = new Set([429, 503, 504]);

type Logger = (message: string, data?: unknown) => void;

/**
 * gaxios options merged by googleapis-common / google-auth-library into EVERY
 * request (Drive, Calendar, Docs, Sheets, Slides, OAuth token refresh):
 *  - `timeout`: a connection that is accepted but never answered (e.g. a proxy
 *    at its connection cap) fails with a request-timeout instead of hanging
 *    the MCP tool call forever — utils/retry.ts only covers calls that opt in
 *    via withRetry(), this covers everything else (uploadFile, listFolder, …);
 *  - `retryConfig.shouldRetry`: retries transport errors and 429/503/504 with
 *    exponential backoff. A timed-out request is NOT retried: it may already
 *    have reached Google (non-idempotent create/batchUpdate).
 */
export function gaxiosOptions(cfg: RuntimeConfig, log: Logger = () => {}): Record<string, unknown> {
  const shouldRetry = (err: any): boolean => {
    const attempt: number = err?.config?.retryConfig?.currentRetryAttempt ?? 0;
    if (attempt >= cfg.retryMax) return false;
    const status = err?.response?.status ?? err?.status;
    if (typeof status === 'number') return RETRYABLE_STATUS.has(status);
    const code = err?.code ?? err?.error?.code ?? err?.cause?.code;
    const retry = typeof code === 'string' && RETRYABLE_CODES.has(code);
    if (retry) {
      log(`transport error ${code} on ${err?.config?.method ?? '?'} ${String(err?.config?.url ?? '').slice(0, 120)} - retry ${attempt + 1}/${cfg.retryMax}`);
    }
    return retry;
  };

  const opts: Record<string, unknown> = {};
  if (cfg.apiTimeout > 0) opts.timeout = cfg.apiTimeout;
  if (cfg.retryMax > 0) {
    opts.retry = true;
    opts.retryConfig = {
      retry: cfg.retryMax,
      noResponseRetries: cfg.retryMax,
      retryDelay: cfg.retryBaseDelay,
      retryDelayMultiplier: 2,
      maxRetryDelay: 30_000,
      shouldRetry,
    };
  } else {
    opts.retry = false;
  }
  return opts;
}
