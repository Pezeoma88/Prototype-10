// Automated tests for Prototype 10's Reduce Motion fixes and the new
// Simplified Interface (Profile › Accessibility).
//
// Pins down:
//   RM  Reduce Motion: while the phone's Reduce Motion is on, the app's
//       switch shows on and can't be changed, and the saved app choice is
//       not overwritten; the description names what is reduced; the choice
//       is read back after a restart.
//   SI  Simplified Interface: it can be turned on, it is saved and read back
//       at launch, and it only applies while Accessibility Mode is on.
//   SC  RideCard, simplified: fewer details, but the time, places, driver,
//       seats, and every request status stay; full-width actions that call
//       the same handlers; the usual layout returns when it's turned off.
//   RC  RiderCard, simplified.
//   H   HomeScreen, simplified: full-width main actions, search, filters,
//       sort and both lists still there.
//
// Real code under test: lib/accessibilitySettings.js, lib/useAccessibility.js,
// lib/preferences.js, components/AccessibilitySettingsSection.js,
// components/RideCard.js, components/RiderCard.js, screens/HomeScreen.js.
// Faked: expo-secure-store (an in-memory store), the icon font, the date
// picker (native), lib/supabase, and the AccessibilityInfo calls that ask the
// phone about its settings.

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Dimensions, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AccessibilitySettingsSection from '../components/AccessibilitySettingsSection';
import RideCard from '../components/RideCard';
import RiderCard from '../components/RiderCard';
import HomeScreen from '../screens/HomeScreen';
import {
  DEFAULT_ACCESSIBILITY_SETTINGS,
  normalizeAccessibilitySettings,
  shouldSimplifyInterface,
} from '../lib/accessibilitySettings';
import { loadAccessibilitySettings, saveAccessibilitySettings } from '../lib/preferences';
import { DEFAULT_RIDE_FILTERS } from '../lib/rideFilters';
import { AccessibilityContext, useAccessibilityState } from '../lib/useAccessibility';

const mockStore = new Map();
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
  getItem: jest.fn((key) => (mockStore.has(key) ? mockStore.get(key) : null)),
  getItemAsync: jest.fn(async (key) => (mockStore.has(key) ? mockStore.get(key) : null)),
  setItemAsync: jest.fn(async (key, value) => {
    mockStore.set(key, value);
  }),
}));

jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-community/datetimepicker', () => () => null);
jest.mock('@react-native-vector-icons/ionicons', () => {
  const { Text: MockText } = require('react-native');
  return { __esModule: true, default: ({ name }) => <MockText testID={`icon-${name}`} /> };
});

const STORAGE_KEY = 'carpoolboard.accessibility';
const ORIGINAL_DIMENSIONS = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };

let systemReduceMotion = false;
let reduceMotionListener = null;

beforeEach(async () => {
  // Default text size, so only the setting under test changes the layout
  // (the test environment's own font scale is large).
  await setFontScale(1);
  mockStore.clear();
  jest.clearAllMocks();
  systemReduceMotion = false;
  reduceMotionListener = null;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(async () => systemReduceMotion);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((event, listener) => {
    if (event === 'reduceMotionChanged') reduceMotionListener = listener;
    return { remove: jest.fn() };
  });
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(async () => {
  jest.restoreAllMocks();
  await setFontScale(ORIGINAL_DIMENSIONS.window.fontScale);
});

async function setFontScale(fontScale) {
  await act(async () => {
    Dimensions.set({
      window: { ...ORIGINAL_DIMENSIONS.window, fontScale },
      screen: { ...ORIGINAL_DIMENSIONS.screen, fontScale },
    });
  });
}

const flat = (node) => StyleSheet.flatten(node.props.style) || {};
const savedSettings = () => JSON.parse(mockStore.get(STORAGE_KEY));
const settingSwitch = (name) => screen.getByRole('switch', { name });

const ON = { ...DEFAULT_ACCESSIBILITY_SETTINGS, enabled: true };
const SIMPLE = { ...ON, simplifiedInterface: true };

// Real accessibility state (the same hook App uses) around `children`, with
// the Profile › Accessibility section above it so a test can flip switches
// and see the rest of the app follow. `latest.value` is what the app sees.
async function renderWithSettings(children, initialSettings = DEFAULT_ACCESSIBILITY_SETTINGS) {
  const latest = {};
  function Harness() {
    const value = useAccessibilityState(initialSettings);
    latest.value = value;
    return (
      <AccessibilityContext.Provider value={value}>
        <AccessibilitySettingsSection />
        {children}
      </AccessibilityContext.Provider>
    );
  }
  const view = await render(<Harness />);
  // Lets the phone's Reduce Motion lookup answer.
  await act(async () => {});
  latest.unmount = () => view.unmount();
  return latest;
}

// --- Ride and rider fixtures ------------------------------------------------

const NOW_MS = Date.parse('2026-11-15T18:00:00Z');
const HOUR = 60 * 60 * 1000;
const RIDER = { id: 'rider-1', name: 'Riley Rider', avatarUrl: null };
const DRIVER = { id: 'driver-1', name: 'Dana Driver', avatarUrl: null };

function makeRide(overrides = {}) {
  return {
    id: 'ride-1',
    driverAccountId: DRIVER.id,
    name: 'Dana Driver',
    avatarUrl: null,
    destination: 'Dallas Love Field',
    pickup: { label: 'Fondren Library', latitude: 32.84454, longitude: -96.78343 },
    destinationPoint: null,
    departureAt: new Date(NOW_MS + 3 * HOUR),
    departureTime: 'Sunday, November 15 · 3:00 PM',
    totalSeats: 3,
    seats: 2,
    driverRating: { average: 4.5, count: 2 },
    matchedRiders: [],
    pendingRequests: [],
    ...overrides,
  };
}

function rideCard(props = {}) {
  const handlers = { onView: jest.fn(), onRequest: jest.fn() };
  const element = (
    <RideCard
      ride={makeRide()}
      currentUser={RIDER}
      activeMode="rider"
      myRequestStatus={null}
      nowMs={NOW_MS}
      {...handlers}
      {...props}
    />
  );
  return { element, ...handlers };
}

// --- RM: Reduce Motion -------------------------------------------------------

describe('RM: Reduce Motion', () => {
  test('RM-01: the description says exactly what is reduced', async () => {
    await renderWithSettings(null, ON);
    expect(settingSwitch('Reduce Motion').props.accessibilityHint).toBe(
      'Map zooming and re-centering, scrolling, pop-up messages, and button press effects happen instantly instead of animating.'
    );
    expect(settingSwitch('Reduce Motion')).toBeEnabled();
  });

  test('RM-02: with the phone’s Reduce Motion on, the switch shows on, is disabled, and saves nothing', async () => {
    systemReduceMotion = true;
    const latest = await renderWithSettings(null, ON);

    const row = settingSwitch('Reduce Motion');
    expect(row).toBeChecked();
    expect(row).toBeDisabled();
    expect(
      screen.getByText('Your phone’s Reduce Motion setting is on, so CarpoolBoard already keeps motion to a minimum.')
    ).toBeOnTheScreen();

    await fireEvent.press(row);
    expect(settingSwitch('Reduce Motion')).toBeChecked();
    expect(latest.value.settings.reduceMotion).toBe(false);
    expect(latest.value.reduceMotion).toBe(true);
    expect(mockStore.has(STORAGE_KEY)).toBe(false);
  });

  test('RM-03: when the phone’s Reduce Motion turns off, the saved app choice shows again', async () => {
    systemReduceMotion = true;
    const latest = await renderWithSettings(null, ON);
    expect(settingSwitch('Reduce Motion')).toBeChecked();

    await act(async () => reduceMotionListener(false));
    expect(settingSwitch('Reduce Motion')).not.toBeChecked();
    expect(settingSwitch('Reduce Motion')).toBeEnabled();
    expect(latest.value.reduceMotion).toBe(false);

    // And a saved "on" is kept the same way.
    await fireEvent.press(settingSwitch('Reduce Motion'));
    await act(async () => reduceMotionListener(true));
    await act(async () => reduceMotionListener(false));
    expect(settingSwitch('Reduce Motion')).toBeChecked();
    expect(savedSettings().reduceMotion).toBe(true);
  });

  test('RM-04: the app’s Reduce Motion is read back after a restart', async () => {
    const first = await renderWithSettings(null, ON);
    await fireEvent.press(settingSwitch('Reduce Motion'));
    expect(savedSettings().reduceMotion).toBe(true);

    // A restart: the app reads the saved settings again before drawing.
    const reloaded = loadAccessibilitySettings();
    expect(reloaded).toMatchObject({ enabled: true, reduceMotion: true });
    await act(async () => first.unmount());
    const latest = await renderWithSettings(null, reloaded);
    expect(settingSwitch('Reduce Motion')).toBeChecked();
    expect(latest.value.reduceMotion).toBe(true);
  });
});

// --- SI: the Simplified Interface setting -----------------------------------

describe('SI: Simplified Interface setting', () => {
  test('SI-01: it is no longer Coming soon, and only applies in Accessibility Mode', () => {
    expect(normalizeAccessibilitySettings({ enabled: true, simplifiedInterface: true }).simplifiedInterface).toBe(true);
    expect(shouldSimplifyInterface(SIMPLE)).toBe(true);
    expect(shouldSimplifyInterface({ ...SIMPLE, enabled: false })).toBe(false);
    expect(shouldSimplifyInterface(ON)).toBe(false);
    expect(shouldSimplifyInterface(null)).toBe(false);
  });

  test('SI-02: the switch turns it on and off and saves each change', async () => {
    const latest = await renderWithSettings(null, ON);
    const row = settingSwitch('Simplified Interface');
    expect(row).toBeEnabled();
    expect(row).not.toBeChecked();
    expect(row.props.accessibilityHint).toMatch(/request status stay visible/);

    await fireEvent.press(row);
    expect(settingSwitch('Simplified Interface')).toBeChecked();
    expect(latest.value.simplifiedInterface).toBe(true);
    expect(savedSettings().simplifiedInterface).toBe(true);

    await fireEvent.press(settingSwitch('Simplified Interface'));
    expect(latest.value.simplifiedInterface).toBe(false);
    expect(savedSettings().simplifiedInterface).toBe(false);
  });

  test('SI-03: it is read back after a restart', async () => {
    await saveAccessibilitySettings(SIMPLE);
    const reloaded = loadAccessibilitySettings();
    expect(reloaded.simplifiedInterface).toBe(true);
    const latest = await renderWithSettings(null, reloaded);
    expect(settingSwitch('Simplified Interface')).toBeChecked();
    expect(latest.value.simplifiedInterface).toBe(true);
  });

  test('SI-04: turning Accessibility Mode off restores the usual layout but remembers the choice', async () => {
    const { element } = rideCard();
    const latest = await renderWithSettings(element, SIMPLE);
    expect(screen.getByRole('button', { name: 'Request a Seat' })).toBeOnTheScreen();

    await fireEvent.press(settingSwitch('Accessibility Mode'));
    expect(latest.value.simplifiedInterface).toBe(false);
    expect(screen.getByRole('button', { name: 'Request Ride' })).toBeOnTheScreen();
    expect(savedSettings()).toMatchObject({ enabled: false, simplifiedInterface: true });

    await fireEvent.press(settingSwitch('Accessibility Mode'));
    expect(screen.getByRole('button', { name: 'Request a Seat' })).toBeOnTheScreen();
  });

  // Updated when High Contrast was implemented: nothing is Coming soon.
  test('SI-05: no setting is Coming soon any more', async () => {
    await renderWithSettings(null, ON);
    expect(settingSwitch('High Contrast')).toBeEnabled();
    expect(screen.queryByText('Coming soon')).toBeNull();
  });
});

// --- SC: RideCard ------------------------------------------------------------

describe('SC: RideCard, simplified', () => {
  test('SC-01: keeps time, pickup, destination, driver, and seats; drops the avatar, rating, and countdown', async () => {
    await renderWithSettings(rideCard().element, SIMPLE);

    expect(screen.getByText('Sunday, November 15 · 3:00 PM')).toBeOnTheScreen();
    expect(screen.getByText('Fondren Library')).toBeOnTheScreen();
    expect(screen.getByText('Dallas Love Field')).toBeOnTheScreen();
    expect(screen.getByText('Driver: Dana Driver')).toBeOnTheScreen();
    expect(screen.getByText('2 seats left')).toBeOnTheScreen();

    expect(screen.queryByText('in 3 hr')).toBeNull();
    expect(screen.queryByText('4.5')).toBeNull();
    // Avatar initials.
    expect(screen.queryByText('DD')).toBeNull();
  });

  test('SC-02: the main action comes first, full width, and calls the same handlers', async () => {
    const { element, onRequest, onView } = rideCard();
    await renderWithSettings(element, SIMPLE);

    const request = screen.getByRole('button', { name: 'Request a Seat' });
    const details = screen.getByRole('button', { name: 'View Ride Details' });
    const actions = request.parent;
    expect(flat(actions).flexDirection).toBe('column');
    expect(actions.children.indexOf(request)).toBeLessThan(actions.children.indexOf(details));
    for (const button of [request, details]) {
      expect(flat(button).alignSelf).toBe('stretch');
      // The regular (larger) button size, not the small one.
      expect(flat(button).minHeight).toBe(50);
    }

    await fireEvent.press(request);
    expect(onRequest).toHaveBeenCalledTimes(1);
    await fireEvent.press(details);
    expect(onView).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['pending', { pendingRequests: [{ riderId: RIDER.id }] }, null, 'Request pending'],
    ['accepted', { matchedRiders: [{ id: RIDER.id }] }, 'accepted', 'Seat confirmed'],
    ['denied', {}, 'denied', 'Request denied'],
    ['cancelled', {}, 'cancelled', 'Request cancelled'],
  ])('SC-03: a %s request still shows its status, and no Request button', async (_name, rideChanges, status, label) => {
    await renderWithSettings(
      rideCard({ ride: makeRide(rideChanges), myRequestStatus: status }).element,
      SIMPLE
    );
    expect(screen.getByText(label)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Request a Seat' })).toBeNull();
    expect(screen.getByRole('button', { name: 'View Ride Details' })).toBeOnTheScreen();
  });

  test('SC-04: a full ride shows Full, and the request can’t be sent', async () => {
    const { element, onRequest } = rideCard({ ride: makeRide({ seats: 0 }) });
    await renderWithSettings(element, SIMPLE);
    const full = screen.getByRole('button', { name: 'Full' });
    expect(full).toBeDisabled();
    await fireEvent.press(full);
    expect(onRequest).not.toHaveBeenCalled();
  });

  test('SC-05: the driver still sees Manage Ride and the confirmed/pending summary', async () => {
    const ride = makeRide({ matchedRiders: [{ id: 'r2' }], pendingRequests: [{ riderId: 'r3' }] });
    const { element, onView } = rideCard({ ride, currentUser: DRIVER, activeMode: 'driver' });
    await renderWithSettings(element, SIMPLE);

    expect(screen.getByText('Driver: Dana Driver (You)')).toBeOnTheScreen();
    expect(screen.getByText('1 confirmed · 1 pending')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Manage Ride' }));
    expect(onView).toHaveBeenCalledTimes(1);
  });

  test('SC-06: turning it off brings back the original layout', async () => {
    await renderWithSettings(rideCard().element, SIMPLE);
    await fireEvent.press(settingSwitch('Simplified Interface'));

    const details = screen.getByRole('button', { name: 'Details' });
    const request = screen.getByRole('button', { name: 'Request Ride' });
    expect(flat(details.parent).flexDirection).toBe('row');
    expect(details.parent.children.indexOf(details)).toBeLessThan(details.parent.children.indexOf(request));
    expect(screen.getByText('in 3 hr')).toBeOnTheScreen();
    expect(screen.getByText('4.5')).toBeOnTheScreen();
    expect(screen.getByText('Dana Driver')).toBeOnTheScreen();
    expect(screen.queryByText('Driver: Dana Driver')).toBeNull();
  });

  test('SC-07: with Extra Large text it stays stacked and nothing is cut off', async () => {
    await setFontScale(1.35);
    await renderWithSettings(rideCard().element, { ...SIMPLE, textSize: 'extraLarge' });
    const request = screen.getByRole('button', { name: 'Request a Seat' });
    expect(flat(request.parent).flexDirection).toBe('column');
    expect(screen.getByText('Request a Seat').props.numberOfLines).toBeUndefined();
    expect(screen.getByText('Driver: Dana Driver').props.numberOfLines).toBeUndefined();
  });
});

// --- RC: RiderCard -----------------------------------------------------------

describe('RC: RiderCard, simplified', () => {
  test('RC-01: keeps the name, badge, and what isn’t posted; Stop Looking still works', async () => {
    const onRemove = jest.fn();
    await renderWithSettings(
      <RiderCard rider={{ id: RIDER.id, name: 'Riley Rider', avatarUrl: null }} isSelf onRemove={onRemove} />,
      SIMPLE
    );
    const nameColumn = screen.getByText(/Riley Rider/).parent;
    expect(within(nameColumn).getByText('Needs a ride')).toBeOnTheScreen();
    expect(screen.getByText('Destination and time not posted yet')).toBeOnTheScreen();
    expect(screen.queryByText('Rider · looking for transportation')).toBeNull();

    const stop = screen.getByRole('button', { name: 'Stop Looking' });
    expect(flat(stop).minHeight).toBe(50);
    await fireEvent.press(stop);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test('RC-02: turning it off brings back the usual card', async () => {
    await renderWithSettings(
      <RiderCard rider={{ id: 'r9', name: 'Riley Rider', avatarUrl: null }} isSelf={false} onRemove={jest.fn()} />,
      SIMPLE
    );
    await fireEvent.press(settingSwitch('Simplified Interface'));
    expect(screen.getByText('Rider · looking for transportation')).toBeOnTheScreen();
  });
});

// --- H: HomeScreen -----------------------------------------------------------

function homeScreen(props = {}) {
  const rides = [makeRide(), makeRide({ id: 'ride-2', destination: 'NorthPark Center', seats: 1 })];
  const handlers = {
    handleAddDriver: jest.fn(),
    handleNeedRide: jest.fn(),
    handleSetMode: jest.fn(),
    handleQuickRequest: jest.fn(),
    handleViewRideDetails: jest.fn(),
    setRideFilters: jest.fn(),
    setRideSortOrder: jest.fn(),
  };
  const element = (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <HomeScreen
        currentUser={RIDER}
        activeMode="rider"
        drivers={rides}
        sortedDrivers={rides}
        pastRides={[]}
        nowMs={NOW_MS}
        riders={[]}
        myRequestStatusByRideId={{}}
        isBoardLoading={false}
        isRefreshing={false}
        boardError=""
        handleRefresh={jest.fn()}
        rideSortOrder="soonest"
        filteredRiderRides={rides}
        rideFilters={DEFAULT_RIDE_FILTERS}
        handleLeaveWaitlist={jest.fn()}
        isAddingDriver={false}
        isAddingRider={false}
        isCurrentUserWaiting={false}
        handleOpenProfile={jest.fn()}
        matchConfirmation={null}
        handleDismissMatchConfirmation={jest.fn()}
        scrollViewRef={{ current: null }}
        detailsView={null}
        rideForm={null}
        riderForm={null}
        {...handlers}
        {...props}
      />
    </SafeAreaProvider>
  );
  return { element, ...handlers };
}

describe('H: HomeScreen, simplified', () => {
  test('H-01: Rider mode: full-width Find a Ride and Ask Drivers for a Ride; search, filters, and rides stay', async () => {
    const { element, handleNeedRide, handleQuickRequest } = homeScreen();
    await renderWithSettings(element, SIMPLE);

    expect(screen.queryByText(/Find a seat on an upcoming ride/)).toBeNull();
    expect(screen.queryByText('Rides that haven’t departed yet')).toBeNull();
    expect(screen.getByRole('button', { name: 'Find a Ride' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Ask Drivers for a Ride' }));
    expect(handleNeedRide).toHaveBeenCalledTimes(1);

    // Search and filters are still there, and both rides are listed.
    expect(screen.getByText('Upcoming Rides')).toBeOnTheScreen();
    expect(screen.getByText('Dallas Love Field')).toBeOnTheScreen();
    expect(screen.getByText('NorthPark Center')).toBeOnTheScreen();
    const requests = screen.getAllByRole('button', { name: 'Request a Seat' });
    expect(requests).toHaveLength(2);
    await fireEvent.press(requests[1]);
    expect(handleQuickRequest).toHaveBeenCalledWith('ride-2');

    // The empty-state wording would name the same button.
    expect(screen.getByText('Riders Looking for a Ride')).toBeOnTheScreen();
    expect(screen.getByText('Tap Ask Drivers for a Ride to let drivers know you’re looking.')).toBeOnTheScreen();
  });

  test('H-02: a rider on the waiting list is told so', async () => {
    await renderWithSettings(homeScreen({ isCurrentUserWaiting: true }).element, SIMPLE);
    expect(screen.getByText('You’re on the Riders Looking for a Ride list.')).toBeOnTheScreen();
  });

  test('H-03: Driver mode: Offer a Ride and See Riders, and the sort control stays', async () => {
    const { element, handleAddDriver } = homeScreen({ currentUser: DRIVER, activeMode: 'driver' });
    await renderWithSettings(element, SIMPLE);

    await fireEvent.press(screen.getByRole('button', { name: 'Offer a Ride' }));
    expect(handleAddDriver).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'See Riders Looking for a Ride' })).toBeOnTheScreen();
    expect(screen.queryByText('Share your open seats')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Manage Ride' })).toHaveLength(2);
  });

  test('H-04: turning it off restores the original Home with the same rides', async () => {
    await renderWithSettings(homeScreen().element, SIMPLE);
    await fireEvent.press(settingSwitch('Simplified Interface'));

    expect(screen.getByText(/Find a seat on an upcoming ride/)).toBeOnTheScreen();
    expect(screen.getByText('Rides that haven’t departed yet')).toBeOnTheScreen();
    expect(screen.getByText('Need a Ride?')).toBeOnTheScreen();
    expect(screen.getByText('Tell drivers')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Request Ride' })).toHaveLength(2);
    expect(screen.getByText('Dallas Love Field')).toBeOnTheScreen();
    expect(screen.getByText('NorthPark Center')).toBeOnTheScreen();
  });
});
