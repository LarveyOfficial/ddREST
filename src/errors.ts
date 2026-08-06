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
}

/** Attached to 401s so a client knows exactly how to recover. */
export const RELOGIN_HINT = { login_start: '/v1/auth/login/start' } as const
