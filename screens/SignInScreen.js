import { useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import AppButton from '../components/AppButton';
import Card from '../components/Card';
import Notice from '../components/Notice';
import PasswordField from '../components/PasswordField';
import ResetEmailStatus from '../components/ResetEmailStatus';
import TextField from '../components/TextField';
import {
  USERNAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  checkUsernameAvailable,
  getCodeProblem,
  getEmailProblem,
  getPasswordProblem,
  getUsernameProblem,
  requestPasswordReset,
  resendSignUpCode,
  signInWithUsername,
  signOut,
  signUpWithUsername,
  updatePassword,
  verifyRecoveryCode,
  verifySignUpCode,
} from '../lib/auth';
import { normalizeEmail } from '../lib/format';
import {
  EMAIL_CODE_LENGTH,
  RESEND_INTERVAL_SECONDS,
  describeRejectedResetCode,
  describeResendWait,
  secondsUntil,
} from '../lib/passwordRecovery';
import { colors, createThemedStyles, gutter, radius, roleColor, roleSoftColor, spacing, statusBarStyle, typography } from '../theme/theme';

const ROLE_OPTIONS = [
  { key: 'driver', title: 'Driver', description: 'Offer seats in your car', icon: 'car-sport' },
  { key: 'rider', title: 'Rider', description: 'Find a seat or ask for one', icon: 'walk' },
];

const STEP_TITLES = {
  signIn: { title: 'Sign in', subtitle: 'Welcome back! Sign in with your username.' },
  signUp: { title: 'Create your account', subtitle: 'One account works as both a Driver and a Rider.' },
  verify: { title: 'Confirm your email', subtitle: 'Enter the code we emailed you to finish setting up.' },
  confirm: { title: 'Confirm your email', subtitle: 'Enter the email you signed up with to get a new code.' },
  forgot: { title: 'Reset your password', subtitle: 'We’ll email you a code to choose a new password.' },
  reset: { title: 'Choose a new password', subtitle: 'Enter the code from the email and your new password.' },
  resetDone: { title: 'Password changed', subtitle: 'Your new password is saved.' },
};

const SECOND = 1000;

// Sign-in / sign-up screen for Supabase Auth accounts (lib/auth.js).
//
// Steps: signIn (username + password), signUp (username, email, password,
// confirm), verify (emailed code that confirms a new account's email),
// confirm (email for a new sign-up code, for someone who left verify
// before confirming), forgot (email for a reset code), reset (code +
// new password) and resetDone (confirmation, then back to sign in). Form
// state lives here; App.js only learns about the result through Supabase's
// auth state (a session appears) and these callbacks:
//   markNewAccount(bool)      whether the session about to appear is a
//                             brand-new account (App shows onboarding)
//   setIsRecoveringPassword   true while a password reset holds a session
//                             but hasn't set the new password yet, so App
//                             keeps this screen open until it's done
// Driver/Rider is picked here as before: it's the mode for this session,
// not a permanent account type.
export default function SignInScreen({
  authRole,
  setAuthRole,
  authNotice,
  markNewAccount,
  setIsRecoveringPassword,
}) {
  const [step, setStep] = useState('signIn');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  // Field-level problems ({ username, email, password, confirmPassword,
  // code }), one form-level error, and one informational message.
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [formInfo, setFormInfo] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  // Set once a reset code has been accepted, so a retry after e.g. a
  // too-weak password doesn't try to use the (now spent) code again.
  const [isRecoveryVerified, setIsRecoveryVerified] = useState(false);
  // The latest reset email: { email, sentAtMs, cooldownUntilMs }. sentAtMs
  // is null when we don't know (rate-limited, or "I already have a code").
  // Kept across steps so going back and forth can't skip the provider's
  // wait between emails.
  const [resetRequest, setResetRequest] = useState(null);
  const [isResendingCode, setIsResendingCode] = useState(false);
  // Blocks a second submit before the isBusy re-render lands (two quick
  // taps arrive in the same render).
  const inFlightRef = useRef(false);

  function goTo(nextStep, info = '') {
    Keyboard.dismiss();
    setStep(nextStep);
    setPassword('');
    setConfirmPassword('');
    setCode('');
    setFieldErrors({});
    setFormError('');
    setFormInfo(info);
  }

  // Runs a submit handler once at a time, with the keyboard closed.
  async function run(handler) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    Keyboard.dismiss();
    setFormError('');
    setIsBusy(true);
    try {
      await handler();
    } finally {
      inFlightRef.current = false;
      setIsBusy(false);
    }
  }

  function handleSignIn() {
    const errors = {};
    if (username.trim() === '') errors.username = 'Please enter your username.';
    if (password === '') errors.password = 'Please enter your password.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    run(async () => {
      markNewAccount(false);
      const result = await signInWithUsername({ username, password });
      if (result.kind === 'verify') {
        setEmail(result.email);
        goTo('verify', 'Your email isn’t confirmed yet. Tap “Send a new code”, then enter it here.');
      } else if (result.kind === 'error') {
        setFormError(result.message);
      }
      // 'signed_in': App sees the new session and opens CarpoolBoard.
    });
  }

  function handleSignUp() {
    const errors = {};
    const usernameProblem = getUsernameProblem(username);
    if (usernameProblem) errors.username = usernameProblem;
    const emailProblem = getEmailProblem(email);
    if (emailProblem) errors.email = emailProblem;
    const passwordProblem = getPasswordProblem(password);
    if (passwordProblem) errors.password = passwordProblem;
    if (confirmPassword === '') {
      errors.confirmPassword = 'Please type your password again.';
    } else if (confirmPassword !== password) {
      errors.confirmPassword = 'The passwords don’t match.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    run(async () => {
      const availability = await checkUsernameAvailable(username);
      if (availability.kind === 'error') {
        setFormError(availability.message);
        return;
      }
      if (!availability.available) {
        setFieldErrors({ username: 'That username is taken. Please choose another.' });
        return;
      }
      markNewAccount(true);
      const result = await signUpWithUsername({ username, email, password, role: authRole });
      if (result.kind === 'verify') {
        setEmail(result.email);
        goTo(
          'verify',
          `We sent a code to ${result.email}. If you don’t see it, check spam. (If that email already has an account, sign in instead.)`
        );
      } else if (result.kind === 'error') {
        markNewAccount(false);
        setFormError(result.message);
      }
    });
  }

  function handleVerify() {
    const codeProblem = getCodeProblem(code);
    setFieldErrors(codeProblem ? { code: codeProblem } : {});
    if (codeProblem) return;

    run(async () => {
      // Only an account that has never been signed in can still be
      // confirmed, so this is always a new account (App shows onboarding).
      markNewAccount(true);
      const result = await verifySignUpCode({ email, code });
      if (result.kind === 'error') {
        setFormError(result.message);
      }
    });
  }

  function handleResendCode() {
    run(async () => {
      const result = await resendSignUpCode(email);
      if (result.kind === 'error') {
        setFormError(result.message);
      } else {
        setFormInfo(`If ${email} is waiting to be confirmed, a new code is on its way. Check spam or junk too.`);
      }
    });
  }

  // From the confirm step: emails a new sign-up code, then shows the code
  // field. Supabase answers the same way whether or not the address has an
  // unconfirmed account, and so does this message.
  function handleRequestConfirmCode() {
    const emailProblem = getEmailProblem(email);
    setFieldErrors(emailProblem ? { email: emailProblem } : {});
    if (emailProblem) return;

    const address = normalizeEmail(email);
    run(async () => {
      const result = await resendSignUpCode(address);
      if (result.kind === 'error') {
        setFormError(result.message);
        return;
      }
      setEmail(address);
      goTo(
        'verify',
        `If ${address} is waiting to be confirmed, we sent it a new code. It may take a minute, and may land in spam or junk.`
      );
    });
  }

  // From the confirm step, for a code that's already in the inbox.
  function handleHaveConfirmCode() {
    const emailProblem = getEmailProblem(email);
    setFieldErrors(emailProblem ? { email: emailProblem } : {});
    if (emailProblem) return;

    const address = normalizeEmail(email);
    setEmail(address);
    goTo('verify', `Enter the most recent code sent to ${address}.`);
  }

  // Remembers a reset email that was just sent (or refused by the rate
  // limit) so the countdown matches the provider's wait between emails.
  function recordResetSent(address) {
    const nowMs = Date.now();
    setResetRequest({ email: address, sentAtMs: nowMs, cooldownUntilMs: nowMs + RESEND_INTERVAL_SECONDS * SECOND });
  }

  function recordResetRateLimited(address, retryAfterSeconds) {
    const nowMs = Date.now();
    setResetRequest((current) => ({
      email: address,
      // A code sent earlier to this address may still be on its way.
      sentAtMs: current?.email === address ? current.sentAtMs : null,
      cooldownUntilMs: nowMs + retryAfterSeconds * SECOND,
    }));
  }

  // From the forgot step: emails a reset code, then shows the code field.
  function handleRequestReset() {
    const emailProblem = getEmailProblem(email);
    setFieldErrors(emailProblem ? { email: emailProblem } : {});
    if (emailProblem) return;

    const address = normalizeEmail(email);
    // A code for this address was requested moments ago: don't send a
    // duplicate. Go to the code field if one is on its way.
    const waitSeconds = resetRequest?.email === address ? secondsUntil(resetRequest.cooldownUntilMs, Date.now()) : 0;
    if (waitSeconds > 0) {
      if (resetRequest.sentAtMs !== null) {
        setEmail(address);
        setIsRecoveryVerified(false);
        goTo('reset');
      } else {
        setFormError(describeResendWait(waitSeconds));
      }
      return;
    }

    run(async () => {
      const result = await requestPasswordReset(address);
      if (result.kind === 'rate_limited') {
        recordResetRateLimited(address, result.retryAfterSeconds);
        setFormError(result.message);
        return;
      }
      if (result.kind === 'error') {
        setFormError(result.message);
        return;
      }
      recordResetSent(address);
      setEmail(address);
      setIsRecoveryVerified(false);
      goTo('reset');
    });
  }

  // From the forgot step, for a code that's already in the inbox (e.g.
  // the app was closed while waiting for the email).
  function handleHaveResetCode() {
    const emailProblem = getEmailProblem(email);
    setFieldErrors(emailProblem ? { email: emailProblem } : {});
    if (emailProblem) return;

    const address = normalizeEmail(email);
    if (resetRequest?.email !== address) {
      setResetRequest({ email: address, sentAtMs: null, cooldownUntilMs: null });
    }
    setEmail(address);
    setIsRecoveryVerified(false);
    goTo('reset');
  }

  // From the reset step: emails another code. The new passwords stay as
  // typed; only the old code is cleared, because the new email replaces it.
  function handleResendResetCode() {
    if (resetRequest && secondsUntil(resetRequest.cooldownUntilMs, Date.now()) > 0) return;
    const address = email;
    setFormInfo('');
    run(async () => {
      setIsResendingCode(true);
      try {
        const result = await requestPasswordReset(address);
        if (result.kind === 'rate_limited') {
          recordResetRateLimited(address, result.retryAfterSeconds);
          setFormError(result.message);
          return;
        }
        if (result.kind === 'error') {
          setFormError(result.message);
          return;
        }
        recordResetSent(address);
        setCode('');
        setFieldErrors(({ code: _spentCode, ...rest }) => rest);
        setFormInfo('A new code is on its way. Only the newest code works, so use the one from the latest email.');
      } finally {
        setIsResendingCode(false);
      }
    });
  }

  function handleResetPassword() {
    const errors = {};
    if (!isRecoveryVerified) {
      const codeProblem = getCodeProblem(code);
      if (codeProblem) errors.code = codeProblem;
    }
    const passwordProblem = getPasswordProblem(password);
    if (passwordProblem) errors.password = passwordProblem;
    if (confirmPassword !== password) errors.confirmPassword = 'The passwords don’t match.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    run(async () => {
      if (!isRecoveryVerified) {
        // The code signs the person in for this one purpose; keep this
        // screen up until the new password is saved.
        setIsRecoveringPassword(true);
        markNewAccount(false);
        const verified = await verifyRecoveryCode({ email, code });
        if (verified.kind === 'error') {
          setIsRecoveringPassword(false);
          if (verified.reason === 'code_rejected') {
            setFieldErrors({ code: describeRejectedResetCode(resetRequest, Date.now()) });
          } else {
            setFormError(verified.message);
          }
          return;
        }
        setIsRecoveryVerified(true);
      }
      const updated = await updatePassword(password);
      if (updated.kind === 'error') {
        setFormError(updated.message);
        return;
      }
      // Saved. End the recovery session and have the person sign in with
      // the new password, which also proves it works (and lets the phone
      // offer to save it).
      await signOut();
      setIsRecoveryVerified(false);
      setResetRequest(null);
      goTo('resetDone');
      setIsRecoveringPassword(false);
    });
  }

  function handleFinishReset() {
    goTo('signIn', 'Sign in with your username and new password.');
  }

  // Leaving a reset half-way ends its recovery session.
  function handleCancelReset() {
    run(async () => {
      if (isRecoveryVerified) {
        await signOut();
        setIsRecoveryVerified(false);
      }
      setIsRecoveringPassword(false);
      goTo('signIn');
    });
  }

  const { title, subtitle } = STEP_TITLES[step];
  const showsRolePicker = step === 'signIn' || step === 'signUp';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={statusBarStyle()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.brand}>
              <View style={styles.logo}>
                <Ionicons name="car-sport" size={30} color={colors.textOnAccent} />
              </View>
              <Text style={styles.brandName}>CarpoolBoard</Text>
            </View>

            <Card style={styles.card}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>

              {authNotice ? <Notice message={authNotice} tone="warning" style={styles.notice} /> : null}
              {formInfo !== '' && <Notice message={formInfo} style={styles.notice} />}

              {(step === 'signIn' || step === 'signUp') && (
                <TextField
                  label="Username"
                  icon="at-outline"
                  placeholder={step === 'signUp' ? 'e.g. jordan_s' : 'Your username'}
                  value={username}
                  onChangeText={setUsername}
                  error={fieldErrors.username}
                  hint={step === 'signUp' ? '3–20 letters, numbers, or underscores. This is how you sign in.' : undefined}
                  maxLength={USERNAME_MAX_LENGTH}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  textContentType="username"
                  autoComplete="username"
                  returnKeyType="next"
                />
              )}

              {(step === 'signUp' || step === 'forgot' || step === 'confirm') && (
                <TextField
                  label="Email"
                  icon="mail-outline"
                  placeholder="e.g. jordan@example.edu"
                  value={email}
                  onChangeText={setEmail}
                  error={fieldErrors.email}
                  hint={step === 'signUp' ? 'Kept private. Used only to confirm your account and reset your password.' : undefined}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              )}

              {(step === 'verify' || (step === 'reset' && !isRecoveryVerified)) && (
                <TextField
                  label="Code from the email"
                  icon="keypad-outline"
                  placeholder={`${EMAIL_CODE_LENGTH}-digit code`}
                  value={code}
                  // Pasted codes may include spaces ("123 456").
                  onChangeText={(text) => setCode(text.replace(/[^0-9]/g, '').slice(0, EMAIL_CODE_LENGTH))}
                  error={fieldErrors.code}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  maxLength={EMAIL_CODE_LENGTH + 6}
                  returnKeyType="done"
                />
              )}

              {step === 'reset' && !isRecoveryVerified && (
                <>
                  <ResetEmailStatus
                    email={email}
                    request={resetRequest?.email === email ? resetRequest : null}
                    onResend={handleResendResetCode}
                    isSending={isResendingCode}
                    disabled={isBusy}
                  />
                  <Pressable
                    onPress={() => goTo('forgot')}
                    accessibilityRole="button"
                    disabled={isBusy}
                    hitSlop={8}
                    style={({ pressed }) => [styles.changeEmail, pressed && styles.pressed]}
                  >
                    <Text style={styles.footerText}>
                      Wrong email? <Text style={styles.link}>Use a different one</Text>
                    </Text>
                  </Pressable>
                </>
              )}

              {(step === 'signIn' || step === 'signUp' || step === 'reset') && (
                <PasswordField
                  label={step === 'reset' ? 'New password' : 'Password'}
                  placeholder={step === 'signIn' ? 'Your password' : 'At least 8 characters'}
                  value={password}
                  onChangeText={setPassword}
                  error={fieldErrors.password}
                  hint={step === 'signIn' ? undefined : 'At least 8 characters, with a letter and a number.'}
                  maxLength={PASSWORD_MAX_LENGTH}
                  textContentType={step === 'signIn' ? 'password' : 'newPassword'}
                  returnKeyType={step === 'signIn' ? 'go' : 'next'}
                  onSubmitEditing={step === 'signIn' ? handleSignIn : undefined}
                />
              )}

              {(step === 'signUp' || step === 'reset') && (
                <PasswordField
                  label="Confirm password"
                  placeholder="Type it again"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  error={fieldErrors.confirmPassword}
                  maxLength={PASSWORD_MAX_LENGTH}
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />
              )}

              {step === 'signIn' && (
                <Pressable
                  onPress={() => goTo('forgot')}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={({ pressed }) => [styles.forgot, pressed && styles.pressed]}
                >
                  <Text style={styles.link}>Forgot password?</Text>
                </Pressable>
              )}

              {/* Driver/Rider is how you're using CarpoolBoard right now, not
                  a permanent account type. */}
              {showsRolePicker && (
                <>
                  <Text style={styles.label}>{step === 'signUp' ? 'Start as…' : 'Continue as…'}</Text>
                  <View style={styles.roleRow}>
                    {ROLE_OPTIONS.map((option) => {
                      const isActive = authRole === option.key;
                      const tint = roleColor(option.key);
                      return (
                        <Pressable
                          key={option.key}
                          onPress={() => setAuthRole(option.key)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: isActive }}
                          style={({ pressed }) => [
                            styles.roleTile,
                            isActive && { borderColor: tint, backgroundColor: roleSoftColor(option.key) },
                            pressed && styles.pressed,
                          ]}
                        >
                          <View style={styles.roleTop}>
                            <Ionicons name={option.icon} size={22} color={isActive ? tint : colors.textMuted} />
                            <Ionicons
                              name={isActive ? 'checkmark-circle' : 'ellipse-outline'}
                              size={18}
                              color={isActive ? tint : colors.textFaint}
                            />
                          </View>
                          <Text style={styles.roleTitle}>{option.title}</Text>
                          <Text style={styles.roleDescription}>{option.description}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              {formError !== '' && <Notice message={formError} tone="danger" style={styles.notice} />}

              {step === 'signIn' && (
                <AppButton
                  title={isBusy ? 'Signing in…' : 'Sign In'}
                  icon={isBusy ? undefined : 'log-in-outline'}
                  onPress={handleSignIn}
                  loading={isBusy}
                />
              )}
              {step === 'signUp' && (
                <AppButton
                  title={isBusy ? 'Creating account…' : 'Create Account'}
                  icon={isBusy ? undefined : 'person-add-outline'}
                  onPress={handleSignUp}
                  loading={isBusy}
                />
              )}
              {step === 'verify' && (
                <>
                  <AppButton
                    title={isBusy ? 'Checking…' : 'Confirm Email'}
                    icon={isBusy ? undefined : 'checkmark-circle-outline'}
                    onPress={handleVerify}
                    loading={isBusy}
                  />
                  <AppButton
                    title="Send a new code"
                    variant="secondary"
                    icon="refresh-outline"
                    onPress={handleResendCode}
                    disabled={isBusy}
                    style={styles.secondaryButton}
                  />
                </>
              )}
              {step === 'confirm' && (
                <>
                  <AppButton
                    title={isBusy ? 'Sending…' : 'Email Me a Code'}
                    icon={isBusy ? undefined : 'mail-outline'}
                    onPress={handleRequestConfirmCode}
                    loading={isBusy}
                  />
                  <AppButton
                    title="I already have a code"
                    variant="secondary"
                    icon="keypad-outline"
                    onPress={handleHaveConfirmCode}
                    disabled={isBusy}
                    style={styles.secondaryButton}
                  />
                </>
              )}
              {step === 'forgot' && (
                <>
                  <AppButton
                    title={isBusy ? 'Sending…' : 'Email Me a Code'}
                    icon={isBusy ? undefined : 'mail-outline'}
                    onPress={handleRequestReset}
                    loading={isBusy}
                  />
                  <AppButton
                    title="I already have a code"
                    variant="secondary"
                    icon="keypad-outline"
                    onPress={handleHaveResetCode}
                    disabled={isBusy}
                    style={styles.secondaryButton}
                  />
                </>
              )}
              {step === 'reset' && (
                <>
                  <AppButton
                    title={isBusy && !isResendingCode ? 'Saving…' : 'Save New Password'}
                    icon={isBusy && !isResendingCode ? undefined : 'key-outline'}
                    onPress={handleResetPassword}
                    loading={isBusy && !isResendingCode}
                    disabled={isBusy}
                  />
                </>
              )}
              {step === 'resetDone' && (
                <>
                  <Notice
                    message="Your password was changed. For your security, please sign in again with your username and new password."
                    tone="success"
                    style={styles.notice}
                  />
                  <AppButton title="Sign In" icon="log-in-outline" onPress={handleFinishReset} />
                </>
              )}
            </Card>

            <View style={styles.footer}>
              {step === 'signIn' ? (
                <>
                  <Pressable onPress={() => goTo('signUp')} accessibilityRole="button" hitSlop={8}>
                    <Text style={styles.footerText}>
                      New to CarpoolBoard? <Text style={styles.link}>Create an account</Text>
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => goTo('confirm')}
                    accessibilityRole="button"
                    hitSlop={8}
                    style={styles.footerSecondLine}
                  >
                    <Text style={styles.footerText}>
                      Didn’t confirm your email? <Text style={styles.link}>Resend confirmation code</Text>
                    </Text>
                  </Pressable>
                </>
              ) : step === 'signUp' ? (
                <Pressable onPress={() => goTo('signIn')} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.footerText}>
                    Already have an account? <Text style={styles.link}>Sign in</Text>
                  </Text>
                </Pressable>
              ) : step === 'resetDone' ? null : (
                <Pressable
                  onPress={step === 'reset' ? handleCancelReset : () => goTo('signIn')}
                  accessibilityRole="button"
                  hitSlop={8}
                  disabled={isBusy}
                >
                  <Text style={styles.link}>Back to sign in</Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = createThemedStyles(() => ({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: gutter,
    paddingVertical: spacing.xxxl,
  },
  brand: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  brandName: {
    ...typography.display,
    color: colors.text,
  },
  card: {
    padding: spacing.xl,
  },
  title: {
    ...typography.bodyStrong,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 21,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  notice: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  forgot: {
    alignSelf: 'flex-end',
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
  link: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  roleRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  roleTile: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    padding: spacing.md,
  },
  pressed: {
    opacity: 0.8,
  },
  roleTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  roleTitle: {
    ...typography.bodyStrong,
    fontWeight: '700',
    color: colors.text,
  },
  roleDescription: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  secondaryButton: {
    marginTop: spacing.md,
  },
  changeEmail: {
    alignSelf: 'center',
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  footerSecondLine: {
    marginTop: spacing.lg,
  },
}));
