import { Text, View } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import Card from './Card';
import Avatar from './Avatar';
import Badge from './Badge';
import AppButton from './AppButton';
import RatingSummary from './RatingSummary';
import RouteLine from './RouteLine';
import { formatTimeUntil, getPastRideLabel, isRideDeparted } from '../lib/rideStatus';
import { useLargeText } from '../lib/useLargeText';
import { colors, createThemedStyles, radius, spacing, typography } from '../theme/theme';

// Full-width ride card (a Driver's OFFER). `ride` is one entry of App's
// `drivers` state. Reads top to bottom: when it leaves, the route, then who
// is driving with the seats left, and finally the action that fits the
// viewer and their current mode (App's activeMode):
//   - your own ride, Driver mode:  Manage Ride
//   - your own ride, Rider mode:   "Your ride" (switch to Driver to manage)
//   - Rider mode:                  Request Ride (or its current status)
// `myRequestStatus` is the signed-in person's request status for this ride
// from Supabase, if any. A denied or cancelled request is final, so those
// show as a status instead of a Request button.
//   - anyone else:                 Details only
// A departed ride (its departure is at or before `nowMs`) is history: it
// shows a Completed/Departed badge and never offers Request or Manage.
// A ride with a pickup spot shows it above the destination; without one,
// RouteLine shows the destination only. The driver's average rating and
// review count sit under their name (ride.driverRating).
// Names, times, and places wrap instead of being cut off. With large text
// (lib/useLargeText.js) the seat badge moves under the driver's name and
// the action buttons stack, so nothing has to squeeze onto one line.
export default function RideCard({ ride, currentUser, activeMode, myRequestStatus, nowMs, onView, onRequest }) {
  const isOwn = ride.driverAccountId === currentUser.id;
  const isFull = ride.seats === 0;
  const isRider = activeMode === 'rider';
  const isPast = isRideDeparted(ride, nowMs);
  const alreadyConfirmed = ride.matchedRiders.some((r) => r.id === currentUser.id);
  const alreadyPending = ride.pendingRequests.some((req) => req.riderId === currentUser.id);
  const timeUntil = formatTimeUntil(ride, nowMs);
  const isLarge = useLargeText();
  // Side by side normally; full width, one per line, with large text.
  const actionStyle = isLarge ? styles.actionStacked : styles.flex;

  let primaryAction = null;
  if (isPast) {
    if (alreadyConfirmed) {
      primaryAction = <StatusPill icon="checkmark-circle" label="You rode along" color={colors.success} style={actionStyle} />;
    } else if (isOwn) {
      primaryAction = <StatusPill icon="car-sport" label="You drove" color={colors.driver} style={actionStyle} />;
    }
  } else if (isOwn && !isRider) {
    primaryAction = <AppButton title="Manage Ride" icon="settings-outline" size="sm" onPress={onView} style={actionStyle} />;
  } else if (isOwn) {
    // Driver controls stay in Driver mode; Details offers the switch.
    primaryAction = <StatusPill icon="car-sport" label="Your ride" color={colors.driver} style={actionStyle} />;
  } else if (isRider) {
    if (alreadyConfirmed) {
      primaryAction = <StatusPill icon="checkmark-circle" label="Seat confirmed" color={colors.success} style={actionStyle} />;
    } else if (alreadyPending) {
      primaryAction = <StatusPill icon="time" label="Request pending" color={colors.pending} style={actionStyle} />;
    } else if (myRequestStatus === 'denied') {
      primaryAction = <StatusPill icon="close-circle" label="Request denied" color={colors.danger} style={actionStyle} />;
    } else if (myRequestStatus === 'cancelled') {
      primaryAction = <StatusPill icon="close-circle" label="Request cancelled" color={colors.textMuted} style={actionStyle} />;
    } else {
      primaryAction = (
        <AppButton
          title={isFull ? 'Full' : 'Request Ride'}
          icon={isFull ? undefined : 'hand-right-outline'}
          size="sm"
          disabled={isFull}
          onPress={onRequest}
          style={actionStyle}
        />
      );
    }
  }

  let seatBadge;
  if (isPast) {
    seatBadge = <Badge label={getPastRideLabel(ride)} tone="muted" />;
  } else if (isFull) {
    seatBadge = <Badge label="Full" tone="danger" />;
  } else {
    seatBadge = <Badge label={`${ride.seats} seat${ride.seats === 1 ? '' : 's'} left`} tone="success" />;
  }

  return (
    <Card onPress={onView} style={[styles.card, isPast && styles.cardPast]}>
      {/* When */}
      <View style={[styles.whenRow, isLarge && styles.whenRowStacked]}>
        <View style={styles.timeChip}>
          <Ionicons name="calendar-clear-outline" size={14} color={isPast ? colors.textMuted : colors.primary} />
          <Text style={[styles.timeText, isPast && styles.timeTextPast]}>{ride.departureTime}</Text>
        </View>
        {timeUntil ? <Text style={[styles.timeUntil, isLarge && styles.timeUntilStacked]}>{timeUntil}</Text> : null}
      </View>

      {/* Where */}
      <View style={styles.route}>
        <RouteLine
          pickup={ride.pickup?.label}
          destination={ride.destination}
          tint={isPast ? colors.textFaint : colors.driver}
        />
      </View>

      {/* Who + seats */}
      <View style={styles.driverRow}>
        <Avatar name={ride.name} role="driver" uri={ride.avatarUrl} size={36} />
        <View style={styles.nameCol}>
          <Text style={styles.name}>{isOwn ? `${ride.name} (You)` : ride.name}</Text>
          <RatingSummary rating={ride.driverRating} style={styles.ratingRow} />
          {isLarge ? <View style={styles.seatBadgeStacked}>{seatBadge}</View> : null}
        </View>
        {isLarge ? null : seatBadge}
      </View>

      {!isPast && (ride.pendingRequests.length > 0 || ride.matchedRiders.length > 0) && (
        <Text style={styles.requestSummary}>
          {ride.matchedRiders.length} confirmed · {ride.pendingRequests.length} pending
        </Text>
      )}

      <View style={[styles.actions, isLarge && styles.actionsStacked]}>
        <AppButton
          title="Details"
          variant="secondary"
          size="sm"
          onPress={onView}
          style={isLarge ? styles.actionStacked : primaryAction ? styles.detailsButton : styles.flex}
        />
        {primaryAction}
      </View>
    </Card>
  );
}

function StatusPill({ icon, label, color, style }) {
  return (
    <View style={[styles.statusPill, { backgroundColor: `${color}14` }, style]}>
      <Ionicons name={icon} size={15} color={color} />
      <Text style={[styles.statusPillText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = createThemedStyles(() => ({
  card: {
    marginBottom: spacing.md,
  },
  cardPast: {
    backgroundColor: colors.surfaceRaised,
  },
  whenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  whenRowStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  timeText: {
    ...typography.label,
    color: colors.primary,
    marginLeft: 6,
    flexShrink: 1,
  },
  timeTextPast: {
    color: colors.textMuted,
  },
  timeUntil: {
    ...typography.caption,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
  timeUntilStacked: {
    marginLeft: 0,
    marginTop: 2,
  },
  route: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  nameCol: {
    flex: 1,
    marginLeft: spacing.md,
    marginRight: spacing.sm,
  },
  name: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  ratingRow: {
    marginTop: 2,
  },
  seatBadgeStacked: {
    marginTop: spacing.sm,
  },
  requestSummary: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionsStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  flex: {
    flex: 1,
  },
  // A stacked action keeps its natural height (flex: 1 in a column would
  // squash it) and fills the card's width.
  actionStacked: {
    flex: 0,
    alignSelf: 'stretch',
  },
  detailsButton: {
    paddingHorizontal: spacing.xl,
  },
  statusPill: {
    flex: 1,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
    flexShrink: 1,
    textAlign: 'center',
  },
}));
