// Automated tests for large text in the shared components (Prototype 10,
// Phase 2). Pins down:
//   1. long names, places, labels, and button titles are never cut off
//      (no numberOfLines on them)
//   2. at the default text size, rows stay side by side (the existing look)
//   3. at large text sizes, rows that can't fit stack instead: InfoRow puts
//      the value under its label, RideCard moves the seat badge under the
//      driver and stacks its buttons, RiderCard moves its badge
//   4. only fixed-size chrome caps text scaling (tab labels, count dots)
//
// The phone's text size is set through Dimensions (fontScale), the same
// value useWindowDimensions reads on a device. Jest's default is 2.
// Faked: lib/supabase (imported by lib/reviews; nothing reaches a server)
// and the icon font.

import { act, render, screen, within } from '@testing-library/react-native';
import { Dimensions, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppButton from '../components/AppButton';
import Badge from '../components/Badge';
import InfoRow from '../components/InfoRow';
import ReviewList from '../components/ReviewList';
import RideCard from '../components/RideCard';
import RiderCard from '../components/RiderCard';
import RouteLine from '../components/RouteLine';
import SectionHeader from '../components/SectionHeader';
import ScreenHeader from '../components/ScreenHeader';
import SegmentedControl from '../components/SegmentedControl';
import TabBar from '../components/TabBar';
import { LARGE_TEXT_SCALE, isLargeTextScale } from '../lib/useLargeText';
import { MAX_CHROME_FONT_SCALE } from '../theme/theme';

jest.mock('../lib/supabase', () => ({ supabase: {} }));

jest.mock('@react-native-vector-icons/ionicons', () => {
  const { Text: MockText } = require('react-native');
  return { __esModule: true, default: ({ name }) => <MockText testID={`icon-${name}`} /> };
});

const NOW_MS = Date.parse('2026-11-11T18:00:00Z');
const HOUR = 60 * 60 * 1000;

const LONG_NAME = 'Alexandria Montgomery-Villanueva Rodriguez';
const LONG_PICKUP = 'University Center North Parking Garage, Level 2 (by the stairs)';
const LONG_DESTINATION = 'Dallas Fort Worth International Airport, Terminal D Departures';

const ORIGINAL_DIMENSIONS = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };

async function setFontScale(fontScale) {
  await act(async () => {
    Dimensions.set({
      window: { ...ORIGINAL_DIMENSIONS.window, fontScale },
      screen: { ...ORIGINAL_DIMENSIONS.screen, fontScale },
    });
  });
}

afterEach(async () => {
  await setFontScale(ORIGINAL_DIMENSIONS.window.fontScale);
});

function makeRide(overrides = {}) {
  return {
    id: 'ride-1',
    driverAccountId: 'driver-1',
    name: LONG_NAME,
    avatarUrl: null,
    destination: LONG_DESTINATION,
    pickup: { label: LONG_PICKUP },
    departureAt: new Date(NOW_MS + 24 * HOUR),
    departureTime: 'Thursday, November 12 · 4:00 PM',
    totalSeats: 3,
    seats: 2,
    driverRating: null,
    matchedRiders: [],
    pendingRequests: [],
    ...overrides,
  };
}

const RIDER = { id: 'rider-1' };

async function renderRideCard(props = {}) {
  await render(
    <RideCard
      ride={makeRide()}
      currentUser={RIDER}
      activeMode="rider"
      myRequestStatus={null}
      nowMs={NOW_MS}
      onView={jest.fn()}
      onRequest={jest.fn()}
      {...props}
    />
  );
}

// No cut-off: the text node shows the whole string and has no line limit.
function expectNotTruncated(text) {
  const node = screen.getByText(text);
  expect(node.props.numberOfLines).toBeUndefined();
  return node;
}

const flat = (node) => StyleSheet.flatten(node.props.style) || {};

// --- The large-text threshold ----------------------------------------------

describe('isLargeTextScale', () => {
  test('default and slightly larger text keep the normal layout', () => {
    expect(isLargeTextScale(1)).toBe(false);
    expect(isLargeTextScale(1.15)).toBe(false);
  });

  test(`from ${LARGE_TEXT_SCALE}x up, rows stack`, () => {
    expect(isLargeTextScale(LARGE_TEXT_SCALE)).toBe(true);
    expect(isLargeTextScale(1.35)).toBe(true); // iOS largest standard size
    expect(isLargeTextScale(3.1)).toBe(true); // iOS largest accessibility size
  });

  test('a missing value is treated as default text', () => {
    expect(isLargeTextScale(undefined)).toBe(false);
  });
});

// --- No truncation ------------------------------------------------------------

describe('long text is shown in full', () => {
  beforeEach(() => setFontScale(1));

  test('AppButton titles wrap instead of cutting off', async () => {
    await render(<AppButton title="Request a seat on this ride to the airport" onPress={jest.fn()} />);
    const title = expectNotTruncated('Request a seat on this ride to the airport');
    expect(flat(title).textAlign).toBe('center');
    // The button still reads as one button to screen readers.
    expect(screen.getByRole('button', { name: 'Request a seat on this ride to the airport' })).toBeOnTheScreen();
  });

  test('Badge labels wrap inside the pill', async () => {
    await render(<Badge label="Waiting for the driver to respond" tone="pending" />);
    expectNotTruncated('Waiting for the driver to respond');
  });

  test('RouteLine shows the full pickup and destination', async () => {
    await render(<RouteLine pickup={LONG_PICKUP} destination={LONG_DESTINATION} />);
    expectNotTruncated(LONG_PICKUP);
    expectNotTruncated(LONG_DESTINATION);
  });

  test('RouteLine without a pickup shows the full destination', async () => {
    await render(<RouteLine destination={LONG_DESTINATION} compact />);
    expectNotTruncated(LONG_DESTINATION);
  });

  test('InfoRow shows a long label and value in full', async () => {
    await render(<InfoRow icon="flag-outline" label="Pickup location" value={LONG_PICKUP} />);
    expectNotTruncated('Pickup location');
    expectNotTruncated(LONG_PICKUP);
  });

  test('RideCard shows the full driver name, time, and route', async () => {
    await renderRideCard();
    expectNotTruncated(LONG_NAME);
    expectNotTruncated('Thursday, November 12 · 4:00 PM');
    expectNotTruncated(LONG_PICKUP);
    expectNotTruncated(LONG_DESTINATION);
    expectNotTruncated('Request Ride');
  });

  test('RideCard status pills are not cut off', async () => {
    await renderRideCard({ myRequestStatus: 'cancelled' });
    expectNotTruncated('Request cancelled');
  });

  test('RiderCard shows a long rider name in full', async () => {
    await render(<RiderCard rider={{ id: 'r1', name: LONG_NAME, avatarUrl: null }} isSelf={false} onRemove={jest.fn()} />);
    expectNotTruncated(LONG_NAME);
    expectNotTruncated('Rider · looking for transportation');
  });

  test('ReviewList shows the reviewer and ride details in full', async () => {
    const review = {
      id: 'rev-1',
      reviewerId: 'r1',
      reviewerName: LONG_NAME,
      reviewerAvatarUrl: null,
      rideDestination: LONG_DESTINATION,
      createdAt: new Date(NOW_MS).toISOString(),
      rating: 5,
      comment: '',
    };
    await render(<ReviewList reviews={[review]} currentUserId="someone-else" />);
    expectNotTruncated(LONG_NAME);
    expect(screen.getByText(new RegExp(`^Ride to ${LONG_DESTINATION} ·`)).props.numberOfLines).toBeUndefined();
  });

  test('section and screen headers wrap long titles and subtitles', async () => {
    await render(
      <>
        <ScreenHeader title={`Hi, ${LONG_NAME}`} subtitle="Here are the rides leaving campus this week" />
        <SectionHeader title={`Rides offered by ${LONG_NAME}`} subtitle="Sorted by departure time, soonest first" />
      </>
    );
    expectNotTruncated(`Hi, ${LONG_NAME}`);
    expectNotTruncated('Here are the rides leaving campus this week');
    expectNotTruncated(`Rides offered by ${LONG_NAME}`);
    expectNotTruncated('Sorted by departure time, soonest first');
  });

  test('segmented control labels wrap instead of cutting off', async () => {
    const options = [
      { key: 'soonest', label: 'Soonest departure' },
      { key: 'seats', label: 'Most seats available' },
    ];
    await render(<SegmentedControl options={options} value="soonest" onChange={jest.fn()} />);
    expectNotTruncated('Soonest departure');
    expectNotTruncated('Most seats available');
  });
});

// --- Default text size keeps the existing layout -------------------------

describe('at the default text size', () => {
  beforeEach(() => setFontScale(1));

  test('InfoRow keeps its label and value side by side', async () => {
    await render(<InfoRow label="Destination" value="Downtown Dallas" />);
    expect(flat(screen.getByTestId('info-row')).flexDirection).toBe('row');
    expect(flat(screen.getByText('Downtown Dallas')).textAlign).toBe('right');
  });

  test('RideCard keeps the seat badge beside the driver and the buttons in a row', async () => {
    await renderRideCard();
    const name = screen.getByText(LONG_NAME);
    // The badge is not inside the name column.
    expect(within(name.parent).queryByText('2 seats left')).toBeNull();
    expect(screen.getByText('2 seats left')).toBeOnTheScreen();

    const details = screen.getByRole('button', { name: 'Details' });
    expect(flat(details.parent).flexDirection).not.toBe('column');
  });
});

// --- Large text stacks rows ---------------------------------------------------

describe('with large text', () => {
  beforeEach(() => setFontScale(2));

  test('InfoRow puts the value under its label, left-aligned', async () => {
    await render(<InfoRow icon="flag-outline" label="Pickup location" value={LONG_PICKUP} />);
    expect(flat(screen.getByTestId('info-row')).flexDirection).not.toBe('row');
    const value = expectNotTruncated(LONG_PICKUP);
    expect(flat(value).textAlign).toBe('left');
    expect(flat(value).flex).toBe(0);
  });

  test('InfoRow with a right-hand element still shows it', async () => {
    await render(<InfoRow label="Status" right={<Badge label="Confirmed" tone="success" />} />);
    expect(screen.getByText('Status')).toBeOnTheScreen();
    expect(screen.getByText('Confirmed')).toBeOnTheScreen();
  });

  test('RideCard moves the seat badge under the driver name', async () => {
    await renderRideCard();
    const nameColumn = screen.getByText(LONG_NAME).parent;
    expect(within(nameColumn).getByText('2 seats left')).toBeOnTheScreen();
    // Shown once, not twice.
    expect(screen.getAllByText('2 seats left')).toHaveLength(1);
  });

  test('RideCard stacks Details and Request Ride at full width', async () => {
    await renderRideCard();
    const details = screen.getByRole('button', { name: 'Details' });
    const request = screen.getByRole('button', { name: 'Request Ride' });
    expect(flat(details.parent).flexDirection).toBe('column');
    for (const actionButton of [details, request]) {
      // Natural height (not squashed by flex: 1 in a column), full width.
      expect(flat(actionButton).flex).toBe(0);
      expect(flat(actionButton).alignSelf).toBe('stretch');
    }
  });

  test('RideCard stacks a status pill too', async () => {
    await renderRideCard({ myRequestStatus: 'denied' });
    const pill = screen.getByText('Request denied').parent;
    expect(flat(pill).flex).toBe(0);
    expect(flat(pill).alignSelf).toBe('stretch');
  });

  test('RideCard puts "time until" under the departure time', async () => {
    await renderRideCard();
    const time = screen.getByText('Thursday, November 12 · 4:00 PM');
    // timeChip -> whenRow
    expect(flat(time.parent.parent).flexDirection).toBe('column');
  });

  test('RiderCard moves its badge under the name', async () => {
    await render(<RiderCard rider={{ id: 'r1', name: LONG_NAME, avatarUrl: null }} isSelf={false} onRemove={jest.fn()} />);
    const nameColumn = screen.getByText(LONG_NAME).parent;
    expect(within(nameColumn).getByText('Needs a ride')).toBeOnTheScreen();
    expect(screen.getAllByText('Needs a ride')).toHaveLength(1);
  });
});

// --- Fixed-size chrome caps scaling --------------------------------------

describe('fixed-size chrome', () => {
  test('tab bar labels and count badges cap their text scaling', async () => {
    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <TabBar activeTab="home" onTabPress={jest.fn()} badges={{ requests: 3 }} />
      </SafeAreaProvider>
    );
    for (const label of ['Home', 'Map', 'Requests', 'Profile']) {
      expect(screen.getByText(label).props.maxFontSizeMultiplier).toBe(MAX_CHROME_FONT_SCALE);
    }
    expect(screen.getByText('3').props.maxFontSizeMultiplier).toBe(MAX_CHROME_FONT_SCALE);
  });

  test('ordinary text has no scaling cap', async () => {
    await render(<Text>Plain</Text>);
    await render(<AppButton title="Save Ride" onPress={jest.fn()} />);
    const title = screen.getByText('Save Ride');
    expect(title.props.maxFontSizeMultiplier).toBeUndefined();
    expect(title.props.allowFontScaling).not.toBe(false);
  });
});
