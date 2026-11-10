// Automated tests for Prototype 10, Feature 1: conversation previews in the
// Messages list on the Requests tab.
//
// Real code under test: lib/messaging.js (listRideConversationPreviews),
// lib/conversationPreview.js, screens/RequestsScreen.js (ConversationRow),
// and the text of supabase/messaging-3-conversation-previews.sql.
// Faked: lib/supabase (a fake client that records every call, so nothing
// can reach any Supabase project), expo-crypto, and the icon font.
//
// The RPC name and result columns are copied by hand from
// supabase/messaging-3-conversation-previews.sql, not imported from the app:
//   list_my_ride_conversation_previews()
//     ...every list_my_ride_conversations column, plus
//     last_message_id, last_message_sender_id, last_message_preview,
//     last_message_created_at
//
// Times are built with the local-time Date constructor so the expected
// labels don't depend on the machine's time zone.

import fs from 'fs';
import path from 'path';
import { render, screen, within } from '@testing-library/react-native';
import { supabase } from '../lib/supabase';
import { listRideConversationPreviews } from '../lib/messaging';
import {
  NO_MESSAGES_TEXT,
  formatConversationTime,
  getConversationPreview,
  getConversationTimeLabel,
} from '../lib/conversationPreview';
import RequestsScreen from '../screens/RequestsScreen';

jest.mock('../lib/supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
}));

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }), { virtual: true });

jest.mock('@react-native-vector-icons/ionicons', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }) => <Text testID={`icon-${name}`} />,
  };
});

// --- No real network -------------------------------------------------------

let networkRequests = 0;
const realFetch = global.fetch;
beforeAll(() => {
  global.fetch = () => {
    networkRequests += 1;
    return Promise.reject(new Error('Network is disabled in the preview tests'));
  };
});
afterAll(() => {
  global.fetch = realFetch;
});

// --- Fake Supabase RPC -----------------------------------------------------

const QUERY_METHODS = ['abortSignal', 'retry', 'select', 'eq', 'order', 'limit'];

function fakeQuery(outcome) {
  const builder = {};
  for (const method of QUERY_METHODS) {
    builder[method] = () => builder;
  }
  builder.then = (onFulfilled, onRejected) => {
    const settled = outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
    return settled.then(onFulfilled, onRejected);
  };
  return builder;
}

// Answers each rpc call by function name.
function rpcAnswersByName(answers) {
  supabase.rpc.mockImplementation((name) => fakeQuery(answers[name]));
}

const ok = (data) => ({ data, error: null, status: 200, statusText: 'OK' });
const failure = (code, message, status) => ({
  data: null,
  error: { code, message, details: null, hint: null },
  status,
  statusText: '',
});
const NETWORK_FAILURE = {
  data: null,
  error: { code: '', message: 'TypeError: Network request failed', details: '', hint: '' },
  status: 0,
  statusText: '',
};
const MISSING_PREVIEWS = failure(
  'PGRST202',
  'Could not find the function public.list_my_ride_conversation_previews without parameters',
  404
);

// --- Test data (server shapes) ---------------------------------------------

const BASE_ROW = {
  conversation_id: 'conv-1',
  ride_id: 'ride-1',
  driver_id: 'driver-1',
  rider_id: 'rider-a',
  my_role: 'rider',
  ride_destination: 'Downtown Dallas',
  ride_departure_at: '2026-11-09T23:00:00+00:00',
  state: 'open',
  can_send: true,
  created_at: '2026-11-08T20:00:00+00:00',
  last_message_at: '2026-11-08T21:06:00.123456+00:00',
};
const PREVIEW_ROW = {
  ...BASE_ROW,
  last_message_id: 'msg-9',
  last_message_sender_id: 'driver-1',
  last_message_preview: 'Running five minutes late',
  last_message_created_at: '2026-11-08T21:06:00.123456+00:00',
};
const EMPTY_ROW = {
  ...BASE_ROW,
  conversation_id: 'conv-2',
  last_message_at: null,
  last_message_id: null,
  last_message_sender_id: null,
  last_message_preview: null,
  last_message_created_at: null,
};

beforeEach(() => {
  jest.resetAllMocks();
});

// --- Data layer --------------------------------------------------------------

describe('CP-01: listRideConversationPreviews (data layer)', () => {
  test('A: calls list_my_ride_conversation_previews with no arguments and maps the newest message', async () => {
    rpcAnswersByName({ list_my_ride_conversation_previews: ok([PREVIEW_ROW, EMPTY_ROW]) });

    const result = await listRideConversationPreviews();

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc.mock.calls[0]).toEqual(['list_my_ride_conversation_previews']);
    expect(result.kind).toBe('ok');
    expect(result.conversations.map((c) => c.id)).toEqual(['conv-1', 'conv-2']);
    expect(result.conversations[0]).toMatchObject({
      id: 'conv-1',
      driverId: 'driver-1',
      riderId: 'rider-a',
      myRole: 'rider',
      canSend: true,
      lastMessage: {
        id: 'msg-9',
        senderId: 'driver-1',
        preview: 'Running five minutes late',
        createdAt: '2026-11-08T21:06:00.123456+00:00',
      },
    });
  });

  test('B: a conversation with no messages gets lastMessage null', async () => {
    rpcAnswersByName({ list_my_ride_conversation_previews: ok([EMPTY_ROW]) });

    const result = await listRideConversationPreviews();

    expect(result.conversations[0].lastMessage).toBeNull();
  });

  test('C: the server’s state and can_send pass through unchanged', async () => {
    const archived = { ...PREVIEW_ROW, ride_id: null, state: 'ride_cancelled', can_send: false };
    rpcAnswersByName({ list_my_ride_conversation_previews: ok([archived]) });

    const result = await listRideConversationPreviews();

    expect(result.conversations[0]).toMatchObject({
      rideId: null,
      state: 'ride_cancelled',
      canSend: false,
    });
    expect(result.conversations[0].lastMessage.preview).toBe('Running five minutes late');
  });

  test('D: if the preview function is not installed, falls back to list_my_ride_conversations (no previews)', async () => {
    rpcAnswersByName({
      list_my_ride_conversation_previews: MISSING_PREVIEWS,
      list_my_ride_conversations: ok([BASE_ROW]),
    });

    const result = await listRideConversationPreviews();

    expect(supabase.rpc.mock.calls.map((call) => call[0])).toEqual([
      'list_my_ride_conversation_previews',
      'list_my_ride_conversations',
    ]);
    expect(result.kind).toBe('ok');
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].id).toBe('conv-1');
    // Unknown, not "no messages": the screen shows no preview line.
    expect('lastMessage' in result.conversations[0]).toBe(false);
  });

  test('E: if messaging is not installed at all, the result is unavailable', async () => {
    rpcAnswersByName({
      list_my_ride_conversation_previews: MISSING_PREVIEWS,
      list_my_ride_conversations: failure('PGRST202', 'Could not find the function', 404),
    });

    const result = await listRideConversationPreviews();

    expect(result).toEqual({ kind: 'unavailable', message: "Messaging isn't available yet." });
  });

  test.each([
    ['a network failure', NETWORK_FAILURE, { kind: 'retry' }],
    ['a thrown fetch error', new TypeError('Network request failed'), { kind: 'retry' }],
    ['permission denied', failure('42501', 'permission denied', 403), { kind: 'error' }],
  ])('F: %s is reported as-is and does NOT fall back', async (_label, outcome, expected) => {
    rpcAnswersByName({ list_my_ride_conversation_previews: outcome });

    const result = await listRideConversationPreviews();

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject(expected);
  });
});

// --- Preview helpers -----------------------------------------------------------

const CONV = { myRole: 'rider', driverId: 'driver-1', riderId: 'rider-a' };

describe('CP-02: getConversationPreview', () => {
  test('A: the other person’s message is shown as-is', () => {
    const preview = getConversationPreview({
      ...CONV,
      lastMessage: { senderId: 'driver-1', preview: 'Running late' },
    });
    expect(preview).toEqual({ kind: 'message', text: 'Running late', mine: false });
  });

  test('B: my own message starts with "You: " (rider and driver)', () => {
    expect(
      getConversationPreview({ ...CONV, lastMessage: { senderId: 'rider-a', preview: 'On my way' } })
    ).toEqual({ kind: 'message', text: 'You: On my way', mine: true });
    expect(
      getConversationPreview({
        ...CONV,
        myRole: 'driver',
        lastMessage: { senderId: 'driver-1', preview: 'Here' },
      })
    ).toEqual({ kind: 'message', text: 'You: Here', mine: true });
  });

  test('C: line breaks and extra spaces fold into one line', () => {
    const preview = getConversationPreview({
      ...CONV,
      lastMessage: { senderId: 'driver-1', preview: 'Meet at\n\nthe   east\tentrance' },
    });
    expect(preview.text).toBe('Meet at the east entrance');
  });

  test('D: no messages gives the friendly placeholder', () => {
    expect(getConversationPreview({ ...CONV, lastMessage: null })).toEqual({
      kind: 'empty',
      text: NO_MESSAGES_TEXT,
      mine: false,
    });
    expect(NO_MESSAGES_TEXT).toBe('No messages yet');
  });

  test('E: unknown (server without previews) gives null', () => {
    expect(getConversationPreview({ ...CONV })).toBeNull();
    expect(getConversationPreview(null)).toBeNull();
  });
});

describe('CP-03: formatConversationTime', () => {
  const NOW = new Date(2026, 10, 9, 18, 0).getTime(); // Mon, Nov 9 2026, 6:00 PM local

  test.each([
    ['today', new Date(2026, 10, 9, 9, 5), /^9:05\sAM$/],
    ['yesterday', new Date(2026, 10, 8, 23, 59), /^Yesterday$/],
    ['earlier this week', new Date(2026, 10, 5, 12, 0), /^Thu$/],
    ['earlier this year', new Date(2026, 9, 3, 12, 0), /^Oct 3$/],
    ['a previous year', new Date(2025, 10, 3, 12, 0), /^Nov 3, 2025$/],
    ['slightly in the future (clock skew)', new Date(2026, 10, 9, 18, 1), /^6:01\sPM$/],
  ])('%s', (_label, date, expected) => {
    expect(formatConversationTime(date, NOW)).toMatch(expected);
  });

  test('never a bare number (so it cannot look like an unread count)', () => {
    for (let daysAgo = 0; daysAgo < 400; daysAgo += 1) {
      const label = formatConversationTime(new Date(2026, 10, 9 - daysAgo, 12), NOW);
      expect(label).not.toMatch(/^\d+$/);
    }
  });

  test('invalid or missing times give an empty label', () => {
    expect(formatConversationTime(new Date('nope'), NOW)).toBe('');
    expect(formatConversationTime(null, NOW)).toBe('');
    expect(getConversationTimeLabel({ lastMessage: null, lastMessageAt: null }, NOW)).toBe('');
  });

  test('uses the newest message’s time, else last_message_at', () => {
    const iso = new Date(2026, 10, 9, 9, 5).toISOString();
    expect(getConversationTimeLabel({ lastMessage: { createdAt: iso } }, NOW)).toMatch(/^9:05\sAM$/);
    expect(getConversationTimeLabel({ lastMessageAt: iso }, NOW)).toMatch(/^9:05\sAM$/);
  });
});

// --- Messages list UI ------------------------------------------------------------

const NOW_MS = new Date(2026, 10, 9, 18, 0).getTime();
const RIDER_A = { id: 'rider-a', name: 'Riley Rider' };
const CONVERSATION_ROW = /^Conversation with /;

function makeConversation(overrides = {}) {
  return {
    id: 'conv-1',
    rideId: 'ride-1',
    driverId: 'driver-1',
    riderId: 'rider-a',
    myRole: 'rider',
    rideDestination: 'Downtown Dallas',
    rideDepartureAt: new Date(2026, 10, 10, 17, 30),
    state: 'open',
    canSend: true,
    createdAt: new Date(2026, 10, 8, 20, 0).toISOString(),
    lastMessageAt: new Date(2026, 10, 9, 9, 5).toISOString(),
    lastMessage: {
      id: 'msg-9',
      senderId: 'driver-1',
      preview: 'Running five minutes late',
      createdAt: new Date(2026, 10, 9, 9, 5).toISOString(),
    },
    otherPersonName: 'Dana Driver',
    ...overrides,
  };
}

function requestsProps(overrides = {}) {
  return {
    currentUser: RIDER_A,
    activeMode: 'rider',
    handleSetMode: jest.fn(),
    drivers: [],
    nowMs: NOW_MS,
    myRequestRows: [],
    isBoardLoading: false,
    isRefreshing: false,
    boardError: '',
    requestNotice: '',
    handleRefresh: jest.fn(),
    handleAcceptRequest: jest.fn(),
    handleDenyRequest: jest.fn(),
    handleWithdrawRequest: jest.fn(),
    handleCancelConfirmedSeat: jest.fn(),
    myReviewByRideId: {},
    reviewsLoaded: false,
    onOpenRide: jest.fn(),
    onGoHome: jest.fn(),
    messagingEnabled: true,
    conversations: [],
    conversationsError: '',
    onMessage: jest.fn(),
    onOpenConversation: jest.fn(),
    ...overrides,
  };
}

function accessibleName(node) {
  return node.props.accessibilityLabel ?? '';
}

describe('CP-04: each conversation row in the Messages list', () => {
  test('A: shows the name, the newest message, its time, and the ride', async () => {
    await render(<RequestsScreen {...requestsProps({ conversations: [makeConversation()] })} />);

    const row = screen.getByRole('button', { name: CONVERSATION_ROW });
    expect(within(row).getByText('Dana Driver')).toBeOnTheScreen();
    expect(within(row).getByTestId('conversation-preview')).toHaveTextContent('Running five minutes late');
    expect(within(row).getByTestId('conversation-time')).toHaveTextContent(/^9:05\sAM$/);
    expect(within(row).getByText(/^Ride to Downtown Dallas · /)).toBeOnTheScreen();
  });

  test('B: the preview is limited to one line with a trailing ellipsis', async () => {
    const long = 'Meet me by the east entrance '.repeat(10).trim();
    const conversation = makeConversation({ lastMessage: { ...makeConversation().lastMessage, preview: long } });
    await render(<RequestsScreen {...requestsProps({ conversations: [conversation] })} />);

    const preview = screen.getByTestId('conversation-preview');
    expect(preview.props.numberOfLines).toBe(1);
    expect(preview.props.ellipsizeMode).toBe('tail');
  });

  test('C: my own last message starts with "You: "', async () => {
    const conversation = makeConversation({
      lastMessage: { ...makeConversation().lastMessage, senderId: 'rider-a', preview: 'On my way' },
    });
    await render(<RequestsScreen {...requestsProps({ conversations: [conversation] })} />);

    expect(screen.getByTestId('conversation-preview')).toHaveTextContent('You: On my way');
    expect(accessibleName(screen.getByRole('button', { name: CONVERSATION_ROW }))).toMatch(
      /last message from you: On my way/
    );
  });

  test('D: a conversation with no messages shows the friendly placeholder and no time', async () => {
    const conversation = makeConversation({ lastMessage: null, lastMessageAt: null });
    await render(<RequestsScreen {...requestsProps({ conversations: [conversation] })} />);

    const row = screen.getByRole('button', { name: CONVERSATION_ROW });
    expect(within(row).getByTestId('conversation-preview')).toHaveTextContent('No messages yet');
    expect(within(row).queryByTestId('conversation-time')).toBeNull();
    expect(accessibleName(row)).toMatch(/no messages yet/);
  });

  test('E: without preview data (older server), the row looks like Prototype 9 plus the time', async () => {
    const { lastMessage, ...withoutPreview } = makeConversation();
    await render(<RequestsScreen {...requestsProps({ conversations: [withoutPreview] })} />);

    const row = screen.getByRole('button', { name: CONVERSATION_ROW });
    expect(within(row).queryByTestId('conversation-preview')).toBeNull();
    expect(within(row).queryByText('No messages yet')).toBeNull();
    expect(within(row).getByTestId('conversation-time')).toHaveTextContent(/^9:05\sAM$/);
    expect(lastMessage).toBeDefined();
  });

  test('F: the screen reader label includes the preview and time, starting with the name', async () => {
    await render(<RequestsScreen {...requestsProps({ conversations: [makeConversation()] })} />);

    const label = accessibleName(screen.getByRole('button', { name: CONVERSATION_ROW }));
    expect(label).toMatch(/^Conversation with Dana Driver, Ride to Downtown Dallas/);
    expect(label).toMatch(/last message: Running five minutes late, 9:05\sAM/);
    expect(label).not.toMatch(/read-only/);
  });

  test('G: read-only rows keep their reason badge and preview, and still open', async () => {
    const props = requestsProps({
      conversations: [makeConversation({ id: 'conv-2', rideId: null, state: 'ride_cancelled', canSend: false })],
    });
    await render(<RequestsScreen {...props} />);

    const row = screen.getByRole('button', { name: CONVERSATION_ROW });
    expect(within(row).getByText('Ride cancelled')).toBeOnTheScreen();
    expect(within(row).getByTestId('conversation-preview')).toHaveTextContent('Running five minutes late');
    expect(accessibleName(row)).toMatch(/, read-only: ride cancelled$/);
  });

  test('H: previews come from the right conversation in a mixed list', async () => {
    const conversations = [
      makeConversation(),
      makeConversation({
        id: 'conv-3',
        otherPersonName: 'Dee Driver',
        driverId: 'driver-3',
        lastMessage: { id: 'msg-3', senderId: 'driver-3', preview: 'See you at Fondren', createdAt: null },
        lastMessageAt: new Date(2026, 10, 8, 12, 0).toISOString(),
      }),
      makeConversation({ id: 'conv-4', otherPersonName: 'Pete Driver', lastMessage: null, lastMessageAt: null }),
    ];
    await render(<RequestsScreen {...requestsProps({ conversations })} />);

    const previewOf = (name) =>
      within(screen.getByRole('button', { name: new RegExp(`^Conversation with ${name}`) })).getByTestId(
        'conversation-preview'
      );
    expect(previewOf('Dana Driver')).toHaveTextContent('Running five minutes late');
    expect(previewOf('Dee Driver')).toHaveTextContent('See you at Fondren');
    expect(previewOf('Pete Driver')).toHaveTextContent('No messages yet');
    expect(
      within(screen.getByRole('button', { name: /^Conversation with Dee Driver/ })).getByTestId('conversation-time')
    ).toHaveTextContent('Yesterday');
  });

  test('I: with messaging off, no previews are shown', async () => {
    await render(
      <RequestsScreen {...requestsProps({ messagingEnabled: false, conversations: [makeConversation()] })} />
    );

    expect(screen.queryByTestId('conversation-preview')).toBeNull();
    expect(screen.queryByText('Running five minutes late')).toBeNull();
  });
});

// --- Migration file (static checks) --------------------------------------------

describe('CP-05: supabase/messaging-3-conversation-previews.sql', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'messaging-3-conversation-previews.sql'),
    'utf8'
  );
  // The SQL without comments, so only real statements are checked.
  const code = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .toLowerCase()
    // Blank out string literals (error messages, the comment text), so
    // words inside them aren't mistaken for statements.
    .replace(/'(?:[^']|'')*'/g, "''");

  test('A: creates only the preview function, as SECURITY INVOKER with a pinned search_path', () => {
    expect(code.match(/create (or replace )?function/g)).toEqual(['create function']);
    expect(code).toMatch(/create function public\.list_my_ride_conversation_previews\(\)/);
    expect(code).toMatch(/security invoker/);
    expect(code).not.toMatch(/security definer/);
    expect(code).toMatch(/set search_path = ''/);
  });

  test('B: only authenticated may execute it; anon and public may not', () => {
    expect(code).toMatch(
      /revoke all on function public\.list_my_ride_conversation_previews\(\) from public, anon, authenticated;/
    );
    expect(code).toMatch(/grant execute on function public\.list_my_ride_conversation_previews\(\) to authenticated;/);
    expect(code).not.toMatch(/to anon/);
  });

  test('C: reads conversations through list_my_ride_conversations (keeps its auth.uid() filter)', () => {
    expect(code).toMatch(/from public\.list_my_ride_conversations\(\) l/);
  });

  test('D: additive only: no drop, alter, insert, update, delete, truncate or realtime change', () => {
    expect(code).not.toMatch(/\b(drop|alter|insert|update|delete|truncate)\b/);
    expect(code).not.toMatch(/supabase_realtime|publication/);
  });

  test('E: runs in one transaction with a pre-flight check', () => {
    expect(code.trim().startsWith('begin;')).toBe(true);
    expect(code.trim().endsWith('commit;')).toBe(true);
    expect(sql).toMatch(/messaging-3 stopped: .*Nothing was changed\./);
  });

  // Runs last in this file (Jest keeps file order).
  test('F: no test in this file made a real network request', () => {
    expect(networkRequests).toBe(0);
  });
});
