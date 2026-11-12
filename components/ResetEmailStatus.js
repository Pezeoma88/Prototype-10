import { Text, View } from 'react-native';
import AppButton from './AppButton';
import Notice from './Notice';
import { useNow } from '../lib/useNow';
import {
  CODE_LIFETIME_SECONDS,
  TYPICAL_DELIVERY_SECONDS,
  formatCountdown,
  getResetEmailStatus,
} from '../lib/passwordRecovery';
import { colors, createThemedStyles, spacing, typography } from '../theme/theme';

const TYPICAL_MINUTES = TYPICAL_DELIVERY_SECONDS / 60;
const LIFETIME_MINUTES = CODE_LIFETIME_SECONDS / 60;

// The "where's my email?" panel on the reset step: when the code was sent,
// how long emails usually take, how long the code lasts, and the
// "Send a new code" button with the provider's resend countdown.
//
// It reads the clock once a second itself, so only this panel re-renders
// while the person waits (the typed passwords above it are untouched).
//   email      the address the code went to
//   request    { sentAtMs, cooldownUntilMs } for that address (either null)
//   onResend   asks for another code; only callable once the countdown ends
//   isSending  a resend is in flight
//   disabled   another action (e.g. Save) is in flight
export default function ResetEmailStatus({ email, request, onResend, isSending = false, disabled = false }) {
  const nowMs = useNow(1000);
  const status = getResetEmailStatus(request, nowMs);
  const isCoolingDown = status.resendIn > 0;

  let message;
  let tone = 'info';
  if (status.phase === 'expired') {
    tone = 'warning';
    message = `The code sent to ${email} has expired. Codes work for ${LIFETIME_MINUTES} minutes. Send a new code to keep going.`;
  } else if (status.phase === 'late') {
    tone = 'warning';
    message = `Still waiting? The code was sent ${status.sentAgo}. Check spam or junk, make sure ${email} is right, or send a new code.`;
  } else if (status.phase === 'waiting') {
    message = `If an account uses ${email}, we sent it a code ${status.sentAgo}. Emails can take up to ${TYPICAL_MINUTES} minutes to arrive, and may land in spam or junk.`;
  } else {
    message = `Enter the newest code sent to ${email}. Codes work for ${LIFETIME_MINUTES} minutes.`;
  }

  let resendTitle = 'Send a new code';
  if (isSending) resendTitle = 'Sending…';
  else if (isCoolingDown) resendTitle = `Send a new code in ${formatCountdown(status.resendIn)}`;

  return (
    <View testID="reset-email-status">
      <Notice message={message} tone={tone} style={styles.notice} />
      {(status.phase === 'waiting' || status.phase === 'late') && (
        <Text style={styles.detail}>Code expires in {formatCountdown(status.expiresIn)}.</Text>
      )}
      <AppButton
        title={resendTitle}
        variant="secondary"
        icon={isSending ? undefined : 'refresh-outline'}
        onPress={onResend}
        loading={isSending}
        disabled={disabled || isCoolingDown}
        accessibilityLabel={
          isCoolingDown && !isSending ? `Send a new code, available in ${status.resendIn} seconds` : undefined
        }
        style={styles.button}
      />
    </View>
  );
}

const styles = createThemedStyles(() => ({
  notice: {
    marginBottom: spacing.sm,
  },
  detail: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  button: {
    marginBottom: spacing.lg,
  },
}));
