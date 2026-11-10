import { formatDepartureTime } from './format';
import { toMessageDate } from './messageText';

// Conversation previews for the Messages list (Prototype 10, Feature 1).
// Pure helpers: they only format what the server returned
// (list_my_ride_conversation_previews in
// supabase/messaging-3-conversation-previews.sql) and never decide who may
// see a conversation.
//
// conversation.lastMessage (added by lib/messaging.js):
//   { id, senderId, preview, createdAt }  the newest message
//   null                                  the server says there are none
//   undefined                             unknown: the preview function
//                                         isn't installed on this server,
//                                         so no preview line is shown

export const NO_MESSAGES_TEXT = 'No messages yet';

// The signed-in person's id in this conversation, from its own row (the
// server's my_role), so the screen needs no extra input.
function myIdIn(conversation) {
  return conversation.myRole === 'driver' ? conversation.driverId : conversation.riderId;
}

// The one line under the name:
//   { kind: 'message', text: 'You: On my way', mine: true }
//   { kind: 'empty', text: 'No messages yet' }
//   null when there is no preview information at all.
// Line breaks and runs of spaces are folded into single spaces so the
// preview always reads as one line before it is cut off with "…".
export function getConversationPreview(conversation) {
  const last = conversation ? conversation.lastMessage : undefined;
  if (last === undefined) {
    return null;
  }
  if (last === null) {
    return { kind: 'empty', text: NO_MESSAGES_TEXT, mine: false };
  }
  const body = String(last.preview ?? '').replace(/\s+/g, ' ').trim();
  if (body === '') {
    return { kind: 'empty', text: NO_MESSAGES_TEXT, mine: false };
  }
  const mine = last.senderId != null && last.senderId === myIdIn(conversation);
  return { kind: 'message', text: mine ? `You: ${body}` : body, mine };
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// When the newest message was sent, short enough for the row's corner, in
// the phone's time zone:
//   today        "9:05 PM"
//   yesterday    "Yesterday"
//   this week    "Mon"
//   this year    "Nov 3"
//   older        "Nov 3, 2025"
// Never a bare number, so it can't be mistaken for an unread count.
// '' when there is no valid time.
export function formatConversationTime(date, nowMs) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const now = new Date(nowMs);
  const days = Math.round((startOfLocalDay(now) - startOfLocalDay(date)) / 86400000);
  if (days <= 0) {
    // Today, or a little in the future when the phone's clock is behind.
    return formatDepartureTime(date);
  }
  if (days === 1) {
    return 'Yesterday';
  }
  if (days < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }
  const options = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== now.getFullYear()) {
    options.year = 'numeric';
  }
  return date.toLocaleDateString('en-US', options);
}

// The time shown for a conversation: its newest message's, else the
// server's last_message_at (all that's known without the preview
// function). '' for a chat with no messages.
export function getConversationTimeLabel(conversation, nowMs) {
  const timestamp = conversation?.lastMessage?.createdAt ?? conversation?.lastMessageAt ?? null;
  return timestamp ? formatConversationTime(toMessageDate(timestamp), nowMs) : '';
}
