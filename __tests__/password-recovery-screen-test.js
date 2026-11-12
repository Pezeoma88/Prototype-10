// Automated tests for the password-reset flow on the sign-in screen
// (Prototype 10, Phase 1). Prototype 9 testers waited 1–2 minutes for reset
// emails and found the wait frustrating; these tests pin down the fixes:
//   1. resend countdown that follows the provider's 60-second interval
//      (or the exact wait Supabase reports)
//   2. feedback while waiting (sent how long ago, usual delay, spam hint,
//      when the code expires, a "still waiting?" nudge)
//   3. no duplicate reset requests (double taps, going back and forth)
//   4. new passwords kept when another code is requested
//   5. clear messages for wrong vs expired codes
//   6. a "Password changed" confirmation, then Sign In
//   7. security: passwords checked before a code is spent; the recovery
//      session is ended after the reset
//
// Real code under test: screens/SignInScreen.js, components/
// ResetEmailStatus.js, lib/auth.js and lib/passwordRecovery.js.
// Faked: lib/supabase (no client, nothing reaches a server) and the icon
// font. Timers and Date are Jest's fake ones.

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SignInScreen from '../screens/SignInScreen';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: jest.fn(),
      verifyOtp: jest.fn(),
      updateUser: jest.fn(),
      signOut: jest.fn(),
      resend: jest.fn(),
      signUp: jest.fn(),
      setSession: jest.fn(),
    },
    functions: { invoke: jest.fn() },
    rpc: jest.fn(),
  },
}));

jest.mock('@react-native-vector-icons/ionicons', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: ({ name }) => <Text testID={`icon-${name}`} /> };
});

const NOW = Date.parse('2026-11-11T18:00:00Z');
const SECOND = 1000;
const EMAIL = 'jordan@example.edu';
const NEW_PASSWORD = 'NewPassword1';

const RATE_LIMIT_42 = {
  status: 429,
  code: 'over_email_send_rate_limit',
  message: 'For security purposes, you can only request this after 42 seconds.',
};
const CODE_REJECTED = { status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' };

// --- Helpers ---------------------------------------------------------------

const flush = () =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });

const advance = (ms) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

async function renderSignIn() {
  const props = {
    authRole: 'rider',
    setAuthRole: jest.fn(),
    authNotice: '',
    markNewAccount: jest.fn(),
    setIsRecoveringPassword: jest.fn(),
  };
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <SignInScreen {...props} />
    </SafeAreaProvider>
  );
  await flush();
  return props;
}

const button = (name) => screen.getByRole('button', { name });
const queryButton = (name) => screen.queryByRole('button', { name });
const isDisabled = (element) => element.props.accessibilityState?.disabled === true;

const emailField = () => screen.getByPlaceholderText('e.g. jordan@example.edu');
const codeField = () => screen.getByPlaceholderText('6-digit code');
const queryCodeField = () => screen.queryByPlaceholderText('6-digit code');
const newPasswordField = () => screen.getByPlaceholderText('At least 8 characters');
const confirmField = () => screen.getByPlaceholderText('Type it again');

async function press(name) {
  await fireEvent.press(button(name));
  await flush();
}

async function type(field, text) {
  await fireEvent.changeText(field, text);
}

async function openForgot() {
  await fireEvent.press(screen.getByText('Forgot password?'));
  await flush();
}

// Signed-out screen -> forgot -> reset step, with the first email sent.
async function startReset({ email = EMAIL } = {}) {
  const props = await renderSignIn();
  await openForgot();
  await type(emailField(), email);
  await press('Email Me a Code');
  return props;
}

async function fillResetForm({ code = '123456', password = NEW_PASSWORD, confirm = password } = {}) {
  await type(codeField(), code);
  await type(newPasswordField(), password);
  await type(confirmField(), confirm);
}

// The resend button, whatever its countdown currently says.
const resendButton = () => screen.getByRole('button', { name: /^Send a new code/ });

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers({ now: NOW });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: () => {} }));
  AppState.currentState = 'active';

  supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  supabase.auth.verifyOtp.mockResolvedValue({ error: null });
  supabase.auth.updateUser.mockResolvedValue({ error: null });
  supabase.auth.signOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// --- 1. Resend countdown ---------------------------------------------------

describe('resend countdown', () => {
  test('starts at the provider’s 60 seconds and counts down to enabled', async () => {
    await startReset();
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(EMAIL);

    expect(resendButton()).toHaveTextContent('Send a new code in 1:00');
    expect(isDisabled(resendButton())).toBe(true);

    await advance(18 * SECOND);
    expect(resendButton()).toHaveTextContent('Send a new code in 0:42');
    expect(isDisabled(resendButton())).toBe(true);

    await advance(42 * SECOND);
    expect(resendButton()).toHaveTextContent(/^Send a new code$/);
    expect(isDisabled(resendButton())).toBe(false);
  });

  test('pressing resend during the countdown sends nothing', async () => {
    await startReset();
    await fireEvent.press(resendButton());
    await flush();
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  test('uses the exact wait Supabase reports when it refuses a resend', async () => {
    await startReset();
    await advance(60 * SECOND);
    supabase.auth.resetPasswordForEmail.mockResolvedValueOnce({ error: RATE_LIMIT_42 });
    await press('Send a new code');

    expect(screen.getByText(/a new code can be sent in 0:42/)).toBeOnTheScreen();
    expect(resendButton()).toHaveTextContent('Send a new code in 0:42');
    expect(isDisabled(resendButton())).toBe(true);
    await advance(42 * SECOND);
    expect(isDisabled(resendButton())).toBe(false);
  });

  test('rate-limited first request stays on the email step and explains the wait', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValueOnce({ error: RATE_LIMIT_42 });
    await startReset();
    expect(screen.getByText('Reset your password')).toBeOnTheScreen();
    expect(screen.getByText(/a new code can be sent in 0:42/)).toBeOnTheScreen();

    // Pressing again before the wait ends doesn't call the server.
    await press('Email Me a Code');
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/a new code can be sent in 0:42/)).toBeOnTheScreen();

    await advance(42 * SECOND);
    await press('Email Me a Code');
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Choose a new password')).toBeOnTheScreen();
  });

  test('hourly email cap: still counts down instead of allowing instant retries', async () => {
    await startReset();
    await advance(60 * SECOND);
    supabase.auth.resetPasswordForEmail.mockResolvedValueOnce({
      error: { status: 429, code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' },
    });
    await press('Send a new code');
    expect(screen.getByText(/sent a lot of emails recently/)).toBeOnTheScreen();
    expect(resendButton()).toHaveTextContent('Send a new code in 1:00');
  });
});

// --- 2. Feedback while waiting ---------------------------------------------

describe('feedback while waiting for the email', () => {
  test('says when the code was sent, the usual delay, spam, and when it expires', async () => {
    await startReset();
    expect(
      screen.getByText(/If an account uses jordan@example\.edu, we sent it a code just now\. Emails can take up to 2 minutes/)
    ).toBeOnTheScreen();
    expect(screen.getByText(/spam or junk/)).toBeOnTheScreen();
    expect(screen.getByText('Code expires in 10:00.')).toBeOnTheScreen();

    await advance(45 * SECOND);
    expect(screen.getByText(/we sent it a code 45 seconds ago/)).toBeOnTheScreen();
    expect(screen.getByText('Code expires in 9:15.')).toBeOnTheScreen();
  });

  test('after 2 minutes, nudges: check spam, check the address, or resend', async () => {
    await startReset();
    await advance(120 * SECOND);
    expect(screen.getByText(/Still waiting\? The code was sent 2 minutes ago/)).toBeOnTheScreen();
    expect(screen.getByText(/make sure jordan@example\.edu is right/)).toBeOnTheScreen();
  });

  test('after 10 minutes, says the code has expired', async () => {
    await startReset();
    await advance(600 * SECOND);
    expect(screen.getByText(/has expired\. Codes work for 10 minutes\. Send a new code/)).toBeOnTheScreen();
    expect(screen.queryByText(/Code expires in/)).toBeNull();
  });

  test('“Use a different one” goes back to the email step with the address kept', async () => {
    await startReset();
    await fireEvent.press(screen.getByText('Use a different one'));
    await flush();
    expect(screen.getByText('Reset your password')).toBeOnTheScreen();
    expect(emailField().props.value).toBe(EMAIL);
  });
});

// --- 3. No duplicate requests ----------------------------------------------

describe('duplicate reset requests', () => {
  test('a double tap on “Email Me a Code” sends one email', async () => {
    let resolveRequest;
    supabase.auth.resetPasswordForEmail.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );
    await renderSignIn();
    await openForgot();
    await type(emailField(), EMAIL);

    // Two taps landing in the same render (before "Sending…" shows), as a
    // quick double tap does on a phone: call the button's handler twice
    // without letting React re-render in between.
    // (Pressable's host element turns onClick into onPress.)
    const { onClick } = button('Email Me a Code').props;
    await act(async () => {
      onClick({ nativeEvent: {} });
      onClick({ nativeEvent: {} });
    });
    await flush();
    expect(screen.getByText('Sending…')).toBeOnTheScreen();

    await act(async () => {
      resolveRequest({ error: null });
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Choose a new password')).toBeOnTheScreen();
  });

  test('going back and asking again for the same address reuses the code on its way', async () => {
    await startReset();
    await advance(20 * SECOND);
    await fireEvent.press(screen.getByText('Use a different one'));
    await flush();
    await press('Email Me a Code');

    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Choose a new password')).toBeOnTheScreen();
    expect(screen.getByText(/we sent it a code 20 seconds ago/)).toBeOnTheScreen();
    expect(resendButton()).toHaveTextContent('Send a new code in 0:40');
  });

  test('leaving for Sign In and coming back doesn’t reset the countdown', async () => {
    await startReset();
    await fireEvent.press(screen.getByText('Back to sign in'));
    await flush();
    await openForgot();
    await type(emailField(), EMAIL);
    await press('Email Me a Code');
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  test('a different address can be sent to right away', async () => {
    await startReset();
    await fireEvent.press(screen.getByText('Use a different one'));
    await flush();
    await type(emailField(), 'casey@example.edu');
    await press('Email Me a Code');
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledTimes(2);
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenLastCalledWith('casey@example.edu');
  });
});

// --- 4. Passwords kept on resend -------------------------------------------

describe('requesting another code', () => {
  test('keeps both typed passwords and clears only the old code', async () => {
    await startReset();
    await fillResetForm({ code: '111111' });
    await advance(60 * SECOND);
    await press('Send a new code');

    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledTimes(2);
    expect(newPasswordField().props.value).toBe(NEW_PASSWORD);
    expect(confirmField().props.value).toBe(NEW_PASSWORD);
    expect(codeField().props.value).toBe('');
    expect(screen.getByText(/A new code is on its way\. Only the newest code works/)).toBeOnTheScreen();
    // The countdown restarts for the new email.
    expect(resendButton()).toHaveTextContent('Send a new code in 1:00');
    expect(screen.getByText('Code expires in 10:00.')).toBeOnTheScreen();
  });

  test('keeps the typed passwords when the resend fails', async () => {
    await startReset();
    await fillResetForm();
    await advance(60 * SECOND);
    supabase.auth.resetPasswordForEmail.mockResolvedValueOnce({ error: { status: 0, name: 'AuthRetryableFetchError' } });
    await press('Send a new code');

    expect(screen.getByText(/Check your connection/)).toBeOnTheScreen();
    expect(newPasswordField().props.value).toBe(NEW_PASSWORD);
    expect(confirmField().props.value).toBe(NEW_PASSWORD);
    expect(codeField().props.value).toBe('123456');
  });

  test('a pasted code with spaces is cleaned up to 6 digits', async () => {
    await startReset();
    await type(codeField(), '123 456');
    expect(codeField().props.value).toBe('123456');
  });
});

// --- 5. Wrong and expired codes --------------------------------------------

describe('wrong and expired codes', () => {
  test('a wrong recent code: explains it, keeps the passwords, ends the recovery hold', async () => {
    const props = await startReset();
    supabase.auth.verifyOtp.mockResolvedValueOnce({ error: CODE_REJECTED });
    await advance(30 * SECOND);
    await fillResetForm({ code: '000000' });
    await press('Save New Password');

    expect(screen.getByText(/That code isn’t right\. Check the 6 digits in the newest CarpoolBoard email/)).toBeOnTheScreen();
    expect(newPasswordField().props.value).toBe(NEW_PASSWORD);
    expect(props.setIsRecoveringPassword).toHaveBeenLastCalledWith(false);
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  test('a code older than 10 minutes: says it expired', async () => {
    await startReset();
    supabase.auth.verifyOtp.mockResolvedValueOnce({ error: CODE_REJECTED });
    await advance(601 * SECOND);
    await fillResetForm();
    await press('Save New Password');
    expect(screen.getByText(/This code has expired\. Codes work for 10 minutes/)).toBeOnTheScreen();
  });

  test('“I already have a code”: unknown send time covers both, and resend is available now', async () => {
    await renderSignIn();
    await openForgot();
    await type(emailField(), EMAIL);
    await press('I already have a code');

    expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(screen.getByText(/Enter the newest code sent to jordan@example\.edu\. Codes work for 10 minutes/)).toBeOnTheScreen();
    expect(isDisabled(resendButton())).toBe(false);

    supabase.auth.verifyOtp.mockResolvedValueOnce({ error: CODE_REJECTED });
    await fillResetForm();
    await press('Save New Password');
    expect(screen.getByText(/That code is wrong or has expired/)).toBeOnTheScreen();
  });

  test('a code of the wrong length is caught before calling the server', async () => {
    await startReset();
    await fillResetForm({ code: '12345' });
    await press('Save New Password');
    expect(screen.getByText(/Codes are 6 digits/)).toBeOnTheScreen();
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
  });
});

// --- 6. Confirmation, then Sign In -----------------------------------------

describe('successful reset', () => {
  test('saves, ends the recovery session, confirms, then goes to Sign In', async () => {
    const props = await startReset();
    await fillResetForm();
    await press('Save New Password');

    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ email: EMAIL, token: '123456', type: 'recovery' });
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: NEW_PASSWORD });
    // Local sign-out only: other devices are untouched, as before.
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(props.setIsRecoveringPassword.mock.calls).toEqual([[true], [false]]);

    expect(screen.getByText('Password changed')).toBeOnTheScreen();
    expect(screen.getByText(/Your password was changed\. For your security, please sign in again/)).toBeOnTheScreen();
    expect(queryButton('Back to sign in')).toBeNull();

    await press('Sign In');
    expect(screen.getByText('Sign in')).toBeOnTheScreen();
    expect(screen.getByText('Sign in with your username and new password.')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Your password').props.value).toBe('');
  });

  test('the recovery session is ended before App is told the reset is over', async () => {
    const order = [];
    supabase.auth.signOut.mockImplementation(async () => {
      order.push('signOut');
      return { error: null };
    });
    const props = await startReset();
    props.setIsRecoveringPassword.mockImplementation((value) => order.push(`recovering:${value}`));
    await fillResetForm();
    await press('Save New Password');
    expect(order).toEqual(['recovering:true', 'signOut', 'recovering:false']);
  });

  test('a new reset after success starts fresh (no stale countdown)', async () => {
    await startReset();
    await fillResetForm();
    await press('Save New Password');
    await press('Sign In');
    await openForgot();
    await press('Email Me a Code');
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledTimes(2);
  });
});

// --- 7. Security and existing behavior -------------------------------------

describe('security and existing behavior', () => {
  test('passwords are checked before the code is used, so a weak password doesn’t spend it', async () => {
    await startReset();
    await fillResetForm({ password: 'short' });
    await press('Save New Password');
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();

    await fillResetForm({ password: NEW_PASSWORD, confirm: 'Different1' });
    await press('Save New Password');
    expect(screen.getByText('The passwords don’t match.')).toBeOnTheScreen();
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
  });

  test('same password as before: code isn’t re-used on retry', async () => {
    await startReset();
    supabase.auth.updateUser.mockResolvedValueOnce({ error: { status: 422, code: 'same_password' } });
    await fillResetForm();
    await press('Save New Password');

    expect(screen.getByText('Your new password must be different from your old one.')).toBeOnTheScreen();
    expect(queryCodeField()).toBeNull();
    expect(screen.queryByTestId('reset-email-status')).toBeNull();

    await type(newPasswordField(), 'Another123');
    await type(confirmField(), 'Another123');
    await press('Save New Password');
    expect(supabase.auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(supabase.auth.updateUser).toHaveBeenLastCalledWith({ password: 'Another123' });
    expect(screen.getByText('Password changed')).toBeOnTheScreen();
  });

  test('cancelling after the code was accepted signs the recovery session out', async () => {
    const props = await startReset();
    supabase.auth.updateUser.mockResolvedValueOnce({ error: { status: 422, code: 'same_password' } });
    await fillResetForm();
    await press('Save New Password');
    await fireEvent.press(screen.getByText('Back to sign in'));
    await flush();
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(props.setIsRecoveringPassword).toHaveBeenLastCalledWith(false);
    expect(screen.getByText('Sign in')).toBeOnTheScreen();
  });

  test('the same message is shown whether or not the email has an account', async () => {
    await startReset({ email: 'nobody@example.edu' });
    expect(screen.getByText(/If an account uses nobody@example\.edu, we sent it a code/)).toBeOnTheScreen();
  });

  test('an invalid email is caught on the email step', async () => {
    await renderSignIn();
    await openForgot();
    await type(emailField(), 'not-an-email');
    await press('Email Me a Code');
    expect(screen.getByText('Please enter a valid email address.')).toBeOnTheScreen();
    expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
