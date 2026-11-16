// Automated tests for the Map tab's suggested meeting spots (Prototype 10,
// from Project 8 user testing: "display available pickup locations ... even
// when no rides are posted, so the map doesn't look completely empty").
//
// Real code under test: screens/MapScreen.js and lib/pickupLocations.js.
// Faked: react-native-maps (a native map can't run in Jest; the fake records
// each marker's props by accessibility label and each animateToRegion call),
// fetchDrivingRoute from lib/routing.js (so no network is used), and the
// icon font.
//
// Expected values (the 9 landmark names, their coordinates, the wording) are
// written out here rather than imported from the app, so the app's own
// constants cannot define what counts as correct.

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import MapScreen from '../screens/MapScreen';
import { fetchDrivingRoute } from '../lib/routing';
import { AccessibilityContext } from '../lib/useAccessibility';
import { DEFAULT_ACCESSIBILITY_SETTINGS } from '../lib/accessibilitySettings';

// --- Fake native map -------------------------------------------------------

const mockMap = { animateToRegion: jest.fn(), fitToCoordinates: jest.fn() };
// Each marker's props from the most recent render, by accessibility label.
let mockMarkers = {};

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { Pressable, View } = require('react-native');

  function MapView({ ref, children, onPress }) {
    mockMarkers = {};
    React.useImperativeHandle(ref, () => mockMap);
    return (
      <View testID="fake-map">
        {/* Stands in for a tap on the map itself, away from any marker. */}
        <Pressable
          testID="fake-map-background"
          onPress={() => onPress?.({ nativeEvent: { action: 'press' } })}
        />
        {children}
      </View>
    );
  }

  function Marker({ children, onPress, accessibilityLabel, ...props }) {
    mockMarkers[accessibilityLabel] = { ...props, hasCustomView: children != null };
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={() => onPress?.({ nativeEvent: { action: 'marker-press' } })}
      />
    );
  }

  return { __esModule: true, default: MapView, Marker, Polyline: () => null };
});

jest.mock('../lib/routing', () => ({
  ...jest.requireActual('../lib/routing'),
  fetchDrivingRoute: jest.fn(),
}));

jest.mock('@react-native-vector-icons/ionicons', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }) => <Text testID={`icon-${name}`} />,
  };
});

// --- Test data -------------------------------------------------------------

// The 9 preset SMU landmarks, written out.
const LANDMARKS = [
  ['Hughes-Trigg Student Center', 32.84354, -96.7833],
  ['Fondren Library', 32.84454, -96.78343],
  ['Dallas Hall', 32.84526, -96.78491],
  ['Moody Coliseum', 32.8404, -96.78068],
  ['Gerald J. Ford Stadium', 32.83779, -96.78279],
  ['Dedman Center for Lifetime Sports', 32.83941, -96.78086],
  ['Meadows Museum', 32.83843, -96.78437],
  ['George W. Bush Presidential Center', 32.84093, -96.77787],
  ['SMU/Mockingbird Station', 32.83783, -96.77496],
];

const suggestedLabel = (name) => `Suggested spot, ${name}. No rides posted here.`;

const FONDREN = { latitude: 32.84454, longitude: -96.78343, label: 'Fondren Library' };
const HUGHES_TRIGG = { latitude: 32.84354, longitude: -96.7833, label: 'Hughes-Trigg Student Center' };

function makeRide(id, pickup, destinationPoint = null, seats = 2) {
  return {
    id,
    name: `Driver ${id}`,
    avatarUrl: null,
    destination: destinationPoint ? destinationPoint.label : 'Downtown Dallas',
    departureTime: 'Today, 5:00 PM',
    seats,
    pickup,
    destinationPoint,
  };
}

const FONDREN_RIDE = makeRide('ride-fondren', FONDREN);
const ROUTE_RIDE = makeRide('ride-route', HUGHES_TRIGG, FONDREN);
// A ride with no pickup spot: on Home only, never on the map.
const NO_PICKUP_RIDE = makeRide('ride-none', null);

// --- Helpers ---------------------------------------------------------------

async function renderMap(drivers = [], overrides = {}) {
  const props = {
    drivers,
    isBoardLoading: false,
    isRefreshing: false,
    boardError: '',
    handleRefresh: jest.fn(),
    onOpenRide: jest.fn(),
    onGoHome: jest.fn(),
    ...overrides,
  };
  const view = await render(<MapScreen {...props} />);
  return { ...props, view };
}

const press = (name) => fireEvent.press(screen.getByRole('button', { name }));
const suggestedMarkerLabels = () =>
  Object.keys(mockMarkers).filter((label) => label.startsWith('Suggested spot, '));
const LIST_TOGGLE = /^Suggested spots list, /;

beforeEach(() => {
  jest.resetAllMocks();
  mockMarkers = {};
});

// --- Tests -----------------------------------------------------------------

describe('Suggested meeting spots on the map', () => {
  test('S-01: with no rides, all 9 landmarks show as suggested markers at their coordinates', async () => {
    await renderMap([]);

    expect(suggestedMarkerLabels().sort()).toEqual(LANDMARKS.map(([name]) => suggestedLabel(name)).sort());
    for (const [name, latitude, longitude] of LANDMARKS) {
      const marker = mockMarkers[suggestedLabel(name)];
      expect(marker.coordinate).toEqual({ latitude, longitude });
    }
    // The empty-state card is still there, and says what the diamonds are.
    expect(screen.getByText('No rides on the map yet')).toBeOnTheScreen();
    expect(screen.getByText('Amber diamonds are suggested meeting spots, not rides.')).toBeOnTheScreen();
  });

  test('S-02: suggested markers use a custom diamond view, not the ride pin, and sit below ride pins', async () => {
    await renderMap([FONDREN_RIDE]);

    const suggested = mockMarkers[suggestedLabel('Dallas Hall')];
    const ride = mockMarkers['Fondren Library: 1 ride'];
    expect(suggested.hasCustomView).toBe(true);
    expect(suggested.pinColor).toBeUndefined();
    expect(suggested.anchor).toEqual({ x: 0.5, y: 0.5 });
    expect(ride.hasCustomView).toBe(false);
    expect(ride.pinColor).toBeDefined();
    expect(ride.zIndex).toBeGreaterThan(suggested.zIndex);
  });

  test('S-03: a ride at a landmark replaces that suggested marker; the other 8 stay', async () => {
    await renderMap([FONDREN_RIDE]);

    expect(mockMarkers[suggestedLabel('Fondren Library')]).toBeUndefined();
    expect(mockMarkers['Fondren Library: 1 ride']).toBeDefined();
    expect(suggestedMarkerLabels()).toHaveLength(8);
    expect(screen.queryByText('No rides on the map yet')).toBeNull();
  });

  test('S-04: when a ride is posted at a selected suggestion, its ride preview replaces the suggestion card', async () => {
    const { view, ...props } = await renderMap([]);
    await press(suggestedLabel('Fondren Library'));
    expect(screen.getByText('Suggested meeting spot · no rides posted')).toBeOnTheScreen();

    await view.rerender(<MapScreen {...props} drivers={[FONDREN_RIDE]} />);

    expect(screen.queryByText('Suggested meeting spot · no rides posted')).toBeNull();
    expect(screen.getByText('1 ride leaving from here')).toBeOnTheScreen();
  });

  test('S-05: tapping a suggested marker shows an honest card with no ride buttons', async () => {
    const { onOpenRide, onGoHome } = await renderMap([]);
    await press(suggestedLabel('Dallas Hall'));

    expect(screen.getByText('Dallas Hall')).toBeOnTheScreen();
    expect(screen.getByText('Suggested meeting spot · no rides posted')).toBeOnTheScreen();
    expect(screen.getByText(/It is not a confirmed ride or an official SMU pickup area\./)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Open Ride Details' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'View Route' })).toBeNull();
    expect(screen.queryByText(/popular/i)).toBeNull();

    // Browse Rides on Home appears in both the empty card and this card.
    const browseButtons = screen.getAllByRole('button', { name: 'Browse Rides on Home' });
    await fireEvent.press(browseButtons.at(-1));
    expect(onGoHome).toHaveBeenCalledTimes(1);
    expect(onOpenRide).not.toHaveBeenCalled();
  });

  test('S-06: the card closes with its Close button and with a tap on the map', async () => {
    await renderMap([]);
    await press(suggestedLabel('Dallas Hall'));
    await press('Close suggested spot');
    expect(screen.queryByText('Suggested meeting spot · no rides posted')).toBeNull();

    await press(suggestedLabel('Dallas Hall'));
    await fireEvent.press(screen.getByTestId('fake-map-background'));
    expect(screen.queryByText('Suggested meeting spot · no rides posted')).toBeNull();
  });

  test('S-07: ride pins still open the ride preview and Ride Details', async () => {
    const { onOpenRide } = await renderMap([FONDREN_RIDE]);
    await press(suggestedLabel('Dallas Hall'));
    await press('Fondren Library: 1 ride');

    // Only one card at a time: the suggestion card has gone.
    expect(screen.queryByText('Suggested meeting spot · no rides posted')).toBeNull();
    expect(screen.getByText('1 ride leaving from here')).toBeOnTheScreen();
    await press('Open Ride Details');
    expect(onOpenRide).toHaveBeenCalledWith('ride-fondren');
  });

  test('S-08: route view hides suggested markers, the legend and the list; closing it brings them back', async () => {
    fetchDrivingRoute.mockReturnValue(new Promise(() => {}));
    await renderMap([ROUTE_RIDE]);
    expect(suggestedMarkerLabels()).toHaveLength(8);

    await press('Hughes-Trigg Student Center: 1 ride');
    await press('View Route');

    expect(suggestedMarkerLabels()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: LIST_TOGGLE })).toBeNull();
    expect(screen.queryByText('Suggested spots')).toBeNull();
    expect(mockMarkers['Pickup: Hughes-Trigg Student Center']).toBeDefined();
    expect(mockMarkers['Destination: Fondren Library']).toBeDefined();

    await press('Close Route');
    expect(suggestedMarkerLabels()).toHaveLength(8);
    expect(screen.getByRole('button', { name: LIST_TOGGLE })).toBeOnTheScreen();
  });

  test('S-09: the legend names both marker types and is one screen-reader element', async () => {
    await renderMap([FONDREN_RIDE]);

    expect(screen.getByText('Rides')).toBeOnTheScreen();
    expect(screen.getByText('Suggested spots')).toBeOnTheScreen();
    expect(
      screen.getByLabelText(
        'Map key: pin markers are rides. Diamond markers are suggested meeting spots, not rides.'
      )
    ).toBeOnTheScreen();
  });

  test('S-10: the suggested-spots list is collapsed by default and opens and closes', async () => {
    await renderMap([FONDREN_RIDE]);

    const toggle = screen.getByRole('button', { name: 'Suggested spots list, 8 spots' });
    expect(toggle).toBeCollapsed();
    expect(screen.getByText('Show suggested spots (8)')).toBeOnTheScreen();
    // Collapsed: only the 8 map markers carry these labels, no list rows.
    expect(screen.getAllByRole('button', { name: suggestedLabel('Dallas Hall') })).toHaveLength(1);

    await fireEvent.press(toggle);
    expect(screen.getByRole('button', { name: 'Suggested spots list, 8 spots' })).toBeExpanded();
    // Open: each spot now has a marker and a list row.
    expect(screen.getAllByRole('button', { name: suggestedLabel('Dallas Hall') })).toHaveLength(2);
    expect(screen.getByText('Dallas Hall')).toBeOnTheScreen();
    expect(screen.queryByText('Fondren Library')).toBeNull();

    await press('Suggested spots list, 8 spots');
    expect(screen.getAllByRole('button', { name: suggestedLabel('Dallas Hall') })).toHaveLength(1);
  });

  test('S-11: a list row selects the spot, moves the map there at the current zoom, and keeps the list open', async () => {
    await renderMap([]);
    await press('Suggested spots list, 9 spots');

    // The list row is rendered after the map marker.
    const rows = screen.getAllByRole('button', { name: suggestedLabel('Meadows Museum') });
    await fireEvent.press(rows.at(-1));

    expect(screen.getByText('Suggested meeting spot · no rides posted')).toBeOnTheScreen();
    expect(mockMap.animateToRegion).toHaveBeenCalledTimes(1);
    expect(mockMap.animateToRegion.mock.calls[0][0]).toEqual({
      latitude: 32.83843,
      longitude: -96.78437,
      latitudeDelta: 0.018,
      longitudeDelta: 0.018,
    });
    expect(screen.getByRole('button', { name: 'Suggested spots list, 9 spots' })).toBeExpanded();
    const selectedRow = screen.getAllByRole('button', { name: suggestedLabel('Meadows Museum') }).at(-1);
    expect(selectedRow).toBeSelected();
    expect(selectedRow.props.accessibilityHint).toBe('Shows this spot on the map.');
  });

  test('S-12: with every landmark taken by a ride, no suggestions, legend or list are shown', async () => {
    const rides = LANDMARKS.map(([label, latitude, longitude], index) =>
      makeRide(`ride-${index}`, { label, latitude, longitude })
    );
    await renderMap(rides);

    expect(suggestedMarkerLabels()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: LIST_TOGGLE })).toBeNull();
    expect(Object.keys(mockMarkers)).toHaveLength(9);
  });

  test('S-13: during the first board load only the loading note shows, not the legend', async () => {
    await renderMap([], { isBoardLoading: true });

    expect(screen.getByText('Loading rides…')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: LIST_TOGGLE })).toBeNull();
  });

  test('S-14: rides without a pickup still get the off-map note alongside the suggestions', async () => {
    await renderMap([NO_PICKUP_RIDE]);

    expect(suggestedMarkerLabels()).toHaveLength(9);
    expect(
      screen.getByText('1 ride has no pickup spot. Drivers can add one by editing their ride.')
    ).toBeOnTheScreen();
  });

  test('S-15: suggestions never change the rides passed in', async () => {
    const drivers = [FONDREN_RIDE, NO_PICKUP_RIDE];
    const before = JSON.parse(JSON.stringify(drivers));
    await renderMap(drivers);
    await press(suggestedLabel('Dallas Hall'));
    await press('Suggested spots list, 8 spots');

    expect(drivers).toEqual(before);
  });

  test('S-16: a suggested marker stops redrawing its custom view shortly after it is drawn', async () => {
    jest.useFakeTimers();
    try {
      await renderMap([]);
      expect(mockMarkers[suggestedLabel('Dallas Hall')].tracksViewChanges).toBe(true);
      await act(async () => {
        jest.advanceTimersByTime(600);
      });
      expect(mockMarkers[suggestedLabel('Dallas Hall')].tracksViewChanges).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test('S-17: with Reduce Motion, a list row jumps the map to the spot instead of gliding', async () => {
    const accessibility = {
      settings: DEFAULT_ACCESSIBILITY_SETTINGS,
      systemReduceMotion: true,
      reduceMotion: true,
      simplifiedInterface: false,
      updateSettings: jest.fn(),
    };
    await render(
      <AccessibilityContext.Provider value={accessibility}>
        <MapScreen
          drivers={[]}
          isBoardLoading={false}
          isRefreshing={false}
          boardError=""
          handleRefresh={jest.fn()}
          onOpenRide={jest.fn()}
          onGoHome={jest.fn()}
        />
      </AccessibilityContext.Provider>
    );
    await press('Suggested spots list, 9 spots');
    const rows = screen.getAllByRole('button', { name: suggestedLabel('Dallas Hall') });
    await fireEvent.press(rows.at(-1));

    expect(mockMap.animateToRegion).toHaveBeenCalledTimes(1);
    expect(mockMap.animateToRegion.mock.calls[0][1]).toBe(0);
  });
});
