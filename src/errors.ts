/**
 * Every error this API emits is an ApiError, so responses share one shape:
 *
 *   { "error": "<machine_code>", "message": "<human text>", ...extra }
 */

export type ErrorCode =
  | 'invalid_request'
  | 'login_ticket_invalid'
  | 'login_ticket_expired'
  | 'state_mismatch'
  | 'authorization_denied'
  | 'token_exchange_failed'
  | 'session_missing'
  | 'session_invalid'
  | 'session_expired'
  | 'csrf_origin_rejected'
  // Device pairing. The first four are RFC 8628 §3.5 codes, emitted verbatim so
  // an off-the-shelf device-flow client understands them.
  | 'authorization_pending'
  | 'slow_down'
  | 'access_denied'
  | 'expired_token'
  | 'invalid_grant'
  | 'pairing_disabled'
  | 'pairing_ticket_invalid'
  | 'pairing_not_found'
  | 'pairing_expired'
  | 'pairing_conflict'
  | 'too_many_requests'
  | 'address_not_found'
  | 'address_missing_coordinates'
  // Resolver shorthands (`latest`, `default`, `name:`) that matched nothing.
  | 'cart_not_found'
  | 'order_not_found'
  | 'store_not_found'
  | 'menu_not_found'
  | 'read_only'
  | 'total_mismatch'
  | 'idempotency_conflict'
  | 'doordash_unauthorized'
  | 'doordash_forbidden'
  | 'doordash_tool_error'
  | 'upstream_error'
  | 'upstream_timeout'
  | 'internal_error'

export class ApiError extends Error {
  readonly status: number
  readonly code: ErrorCode
  readonly extra: Record<string, unknown>

  constructor(status: number, code: ErrorCode, message: string, extra: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.extra = extra
  }

  toBody(): Record<string, unknown> {
    return { error: this.code, message: this.message, ...this.extra }
  }

  static badRequest(message: string, extra?: Record<string, unknown>) {
    return new ApiError(400, 'invalid_request', message, extra)
  }

  /** The same error with more context attached. Status, code and message are unchanged. */
  with(extra: Record<string, unknown>): ApiError {
    return new ApiError(this.status, this.code, this.message, { ...this.extra, ...extra })
  }

  /**
   * Seconds a client should wait before retrying, for a `Retry-After` header.
   *
   * Read off `extra` rather than stored separately so there is one source of
   * truth: whatever the body advertises is what the header says.
   */
  get retryAfterSeconds(): number | undefined {
    for (const key of ['retry_after_seconds', 'interval']) {
      const value = this.extra[key]
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.ceil(value)
    }
    return undefined
  }
}

/** Attached to 401s so a client knows exactly how to recover. */
export const RELOGIN_HINT = { login_start: '/v1/auth/login/start' } as const
