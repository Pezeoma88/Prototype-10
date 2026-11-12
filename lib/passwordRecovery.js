// Timing rules and wording for the password-reset screens (Phase 1).
//
// The numbers come from the Supabase Auth settings recorded in the
// Prototype 10 Phase 0 inspection. They describe the provider; changing
// them here does not change Supabase. If the dashboard settings change,
// update these to match.
//   * Minimum interval per user:  60 seconds between reset emails
//   * Email OTP expiration:       600 seconds
//   * Email OTP length:           6 digits
//   * Prototype 9 testing: reset emails took about 1–2 minutes to arrive
export const RESEND_INTERVAL_SECONDS = 60;
export const CODE_LIFETIME_SECONDS = 600;
export const EMAIL_CODE_LENGTH = 6;
export const TYPICAL_DELIVERY_SECONDS = 120;

const SECOND = 1000;

// Seconds the server asked us to wait, read from Supabase's rate-limit
// message ("For security purposes, you can only request this after 42
// seconds."). null when the error doesn't say.
export function getRetryAfterSeconds(error) {
  const match = /after\s+(\d+)\s+seconds?/i.exec(error?.message || '');
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export function isRateLimitError(error) {
  return (
    error?.status === 429 ||
    error?.code === 'over_email_send_rate_limit' ||
    error?.code === 'over_request_rate_limit'
  );
}

// Whole seconds until `untilMs`, never negative. 0 means "now".
export function secondsUntil(untilMs, nowMs) {
  if (!untilMs) return 0;
  return Math.max(0, Math.ceil((untilMs - nowMs) / SECOND));
}

// 75 -> "1:15", 9 -> "0:09".
export function formatCountdown(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

// "just now", "40 seconds ago", "1 minute ago", "3 minutes ago".
export function formatElapsed(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
}

// What the reset step shows about the email that's on its way, given the
// latest request ({ sentAtMs, cooldownUntilMs }, either may be null) and
// the current time. Returns:
//   phase           'unknown'  we don't know when a code was sent (the
//                              person tapped "I already have a code")
//                   'waiting'  sent recently, may still be in transit
//                   'late'     longer than emails usually take
//                   'expired'  older than the code lifetime
//   sentAgo         e.g. "40 seconds ago" (null when unknown)
//   expiresIn       seconds left on the code (null when unknown)
//   resendIn        seconds before another code can be requested
export function getResetEmailStatus(request, nowMs) {
  const sentAtMs = request?.sentAtMs ?? null;
  const resendIn = secondsUntil(request?.cooldownUntilMs, nowMs);
  if (sentAtMs === null) {
    return { phase: 'unknown', sentAgo: null, expiresIn: null, resendIn };
  }
  const elapsed = Math.max(0, (nowMs - sentAtMs) / SECOND);
  const expiresIn = Math.max(0, Math.ceil(CODE_LIFETIME_SECONDS - elapsed));
  let phase = 'waiting';
  if (expiresIn === 0) phase = 'expired';
  else if (elapsed >= TYPICAL_DELIVERY_SECONDS) phase = 'late';
  return { phase, sentAgo: formatElapsed(elapsed), expiresIn, resendIn };
}

// Supabase rejects a wrong code and an expired one with the same error
// (otp_expired), so the app uses what it knows about when the code was
// sent to say which is more likely.
export function describeRejectedResetCode(request, nowMs) {
  const { phase } = getResetEmailStatus(request, nowMs);
  const minutes = CODE_LIFETIME_SECONDS / 60;
  if (phase === 'expired') {
    return `This code has expired. Codes work for ${minutes} minutes. Tap “Send a new code” to get another.`;
  }
  if (phase === 'unknown') {
    return `That code is wrong or has expired. Codes work for ${minutes} minutes, and only the newest one works. Send a new code if you need one.`;
  }
  return `That code isn’t right. Check the ${EMAIL_CODE_LENGTH} digits in the newest CarpoolBoard email. Sending a new code replaces the old one.`;
}

// The message for a rate-limited request, given how long to wait.
export function describeResendWait(seconds) {
  return `For security, a new code can be sent in ${formatCountdown(seconds)}. If a code already arrived, you can still use it.`;
}
