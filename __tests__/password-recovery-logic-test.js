// Automated tests for the password-recovery rules (Prototype 10, Phase 1):
// the timing helpers in lib/passwordRecovery.js and how lib/auth.js turns
// Supabase's answers into results the reset screens can act on.
//
// Provider settings these tests encode (Phase 0 inspection): 60 seconds
// between reset emails per person, codes expire after 600 seconds, codes
// are 6 digits. Prototype 9 testing: emails took about 1–2 minutes.
//
// Faked: lib/supabase, so nothing can reach a server.

import {
  CODE_LIFETIME_SECONDS,
  EMAIL_CODE_LENGTH,
  RESEND_INTERVAL_SECONDS,
  describeRejectedResetCode,
  formatCountdown,
  formatElapsed,
  getResetEmailStatus,
  getRetryAfterSeconds,
  isRateLimitError,
  secondsUntil,
} from '../lib/passwordRecovery';
import { getCodeProblem, requestPasswordReset, updatePassword, verifyRecoveryCode } from '../lib/auth';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: jest.fn(),
      verifyOtp: jest.fn(),
      updateUser: jest.fn(),
    },
  },
}));

const NOW = Date.parse('2026-11-11T18:00:00Z');
const SECOND = 1000;

beforeEach(() => {
  jest.resetAllMocks();
});

describe('provider settings', () => {
  test('match the Supabase Auth settings from the Phase 0 inspection', () => {
    expect(RESEND_INTERVAL_SECONDS).toBe(60);
    expect(CODE_LIFETIME_SECONDS).toBe(600);
    expect(EMAIL_CODE_LENGTH).toBe(6);
  });
});

describe('getRetryAfterSeconds', () => {
  test('reads the wait from Supabase’s per-person interval message', () => {
    expect(
      getRetryAfterSeconds({ message: 'For security purposes, you can only request this after 42 seconds.' })
    ).toBe(42);
    expect(getRetryAfterSeconds({ message: 'For security purposes, you can only request this after 1 second.' })).toBe(1);
  });

  test('is null when the message has no number (e.g. the hourly cap)', () => {
    expect(getRetryAfterSeconds({ message: 'email rate limit exceeded' })).toBeNull();
    expect(getRetryAfterSeconds({})).toBeNull();
    expect(getRetryAfterSeconds(null)).toBeNull();
  });
});

describe('isRateLimitError', () => {
  test('recognizes 429s and Supabase’s rate-limit codes only', () => {
    expect(isRateLimitError({ status: 429 })).toBe(true);
    expect(isRateLimitError({ code: 'over_email_send_rate_limit' })).toBe(true);
    expect(isRateLimitError({ code: 'over_request_rate_limit' })).toBe(true);
    expect(isRateLimitError({ status: 400, code: 'otp_expired' })).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
  });
});

describe('countdown formatting', () => {
  test('secondsUntil rounds up and never goes negative', () => {
    expect(secondsUntil(NOW + 59_001, NOW)).toBe(60);
    expect(secondsUntil(NOW + 60 * SECOND, NOW)).toBe(60);
    expect(secondsUntil(NOW, NOW)).toBe(0);
    expect(secondsUntil(NOW - 5 * SECOND, NOW)).toBe(0);
    expect(secondsUntil(null, NOW)).toBe(0);
  });

  test('formatCountdown shows minutes and seconds', () => {
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(42)).toBe('0:42');
    expect(formatCountdown(9)).toBe('0:09');
    expect(formatCountdown(600)).toBe('10:00');
    expect(formatCountdown(-3)).toBe('0:00');
  });

  test('formatElapsed reads naturally', () => {
    expect(formatElapsed(0)).toBe('just now');
    expect(formatElapsed(40)).toBe('40 seconds ago');
    expect(formatElapsed(65)).toBe('1 minute ago');
    expect(formatElapsed(185)).toBe('3 minutes ago');
  });
});

describe('getResetEmailStatus', () => {
  const sent = { sentAtMs: NOW, cooldownUntilMs: NOW + 60 * SECOND };

  test('right after sending: waiting, full code lifetime, full resend wait', () => {
    expect(getResetEmailStatus(sent, NOW)).toEqual({
      phase: 'waiting',
      sentAgo: 'just now',
      expiresIn: 600,
      resendIn: 60,
    });
  });

  test('resend opens after 60 seconds while the code is still valid', () => {
    const status = getResetEmailStatus(sent, NOW + 60 * SECOND);
    expect(status.resendIn).toBe(0);
    expect(status.phase).toBe('waiting');
    expect(status.expiresIn).toBe(540);
  });

  test('after the usual 1–2 minutes, says the email is late', () => {
    expect(getResetEmailStatus(sent, NOW + 119 * SECOND).phase).toBe('waiting');
    expect(getResetEmailStatus(sent, NOW + 120 * SECOND).phase).toBe('late');
  });

  test('after 10 minutes, the code has expired', () => {
    expect(getResetEmailStatus(sent, NOW + 599 * SECOND).phase).toBe('late');
    const status = getResetEmailStatus(sent, NOW + 600 * SECOND);
    expect(status.phase).toBe('expired');
    expect(status.expiresIn).toBe(0);
  });

  test('unknown when we don’t know when the code was sent', () => {
    expect(getResetEmailStatus(null, NOW)).toEqual({ phase: 'unknown', sentAgo: null, expiresIn: null, resendIn: 0 });
    expect(getResetEmailStatus({ sentAtMs: null, cooldownUntilMs: NOW + 42 * SECOND }, NOW).resendIn).toBe(42);
  });
});

describe('describeRejectedResetCode', () => {
  const sent = { sentAtMs: NOW, cooldownUntilMs: NOW + 60 * SECOND };

  test('a recent code: says the code is wrong and only the newest works', () => {
    expect(describeRejectedResetCode(sent, NOW + 30 * SECOND)).toMatch(/That code isn’t right.*newest/);
  });

  test('an old code: says it expired and how long codes last', () => {
    expect(describeRejectedResetCode(sent, NOW + 601 * SECOND)).toMatch(/This code has expired. Codes work for 10 minutes/);
  });

  test('unknown send time: covers both cases', () => {
    expect(describeRejectedResetCode(null, NOW)).toMatch(/wrong or has expired/);
  });
});

describe('getCodeProblem', () => {
  test('accepts exactly 6 digits', () => {
    expect(getCodeProblem('123456')).toBe('');
    expect(getCodeProblem(' 123456 ')).toBe('');
  });

  test('explains empty and wrong-length codes', () => {
    expect(getCodeProblem('')).toBe('Enter the code from the email.');
    expect(getCodeProblem('12345')).toMatch(/Codes are 6 digits/);
    expect(getCodeProblem('1234567')).toMatch(/Codes are 6 digits/);
    expect(getCodeProblem('12a456')).toMatch(/Codes are 6 digits/);
  });
});

describe('requestPasswordReset', () => {
  test('sends to the normalized address', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    await expect(requestPasswordReset('  Jordan@Example.EDU ')).resolves.toEqual({ kind: 'sent' });
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('jordan@example.edu');
  });

  test('per-person interval: returns the server’s wait in seconds', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({
      error: {
        status: 429,
        code: 'over_email_send_rate_limit',
        message: 'For security purposes, you can only request this after 42 seconds.',
      },
    });
    const result = await requestPasswordReset('jordan@example.edu');
    expect(result.kind).toBe('rate_limited');
    expect(result.retryAfterSeconds).toBe(42);
    expect(result.message).toMatch(/0:42/);
  });

  test('hourly cap (no number given): waits one interval and says so plainly', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({
      error: { status: 429, code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' },
    });
    const result = await requestPasswordReset('jordan@example.edu');
    expect(result.kind).toBe('rate_limited');
    expect(result.retryAfterSeconds).toBe(60);
    expect(result.message).toMatch(/sent a lot of emails recently/);
  });

  test('network failure: error with the connection message', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: { status: 0, name: 'AuthRetryableFetchError' } });
    const result = await requestPasswordReset('jordan@example.edu');
    expect(result).toEqual({ kind: 'error', message: expect.stringMatching(/Check your connection/) });
  });
});

describe('verifyRecoveryCode', () => {
  test('success', async () => {
    supabase.auth.verifyOtp.mockResolvedValue({ error: null });
    await expect(verifyRecoveryCode({ email: 'Jordan@Example.edu', code: ' 123456 ' })).resolves.toEqual({
      kind: 'verified',
    });
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'jordan@example.edu',
      token: '123456',
      type: 'recovery',
    });
  });

  test('wrong or expired code: marked code_rejected', async () => {
    supabase.auth.verifyOtp.mockResolvedValue({
      error: { status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' },
    });
    const result = await verifyRecoveryCode({ email: 'jordan@example.edu', code: '000000' });
    expect(result.kind).toBe('error');
    expect(result.reason).toBe('code_rejected');
  });

  test('other failures are not blamed on the code', async () => {
    supabase.auth.verifyOtp.mockResolvedValue({ error: { status: 429, code: 'over_request_rate_limit' } });
    const result = await verifyRecoveryCode({ email: 'jordan@example.edu', code: '123456' });
    expect(result.reason).toBeUndefined();
    expect(result.message).toMatch(/Too many attempts/);
  });
});

describe('updatePassword', () => {
  test('same password: explains it must differ', async () => {
    supabase.auth.updateUser.mockResolvedValue({ error: { status: 422, code: 'same_password' } });
    await expect(updatePassword('Password1')).resolves.toEqual({
      kind: 'error',
      message: 'Your new password must be different from your old one.',
    });
  });
});
