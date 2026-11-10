-- =====================================================================
-- CarpoolBoard Prototype 10 — Feature 1: Conversation previews
-- =====================================================================
--
-- Adds ONE read-only function so the Messages list (Requests tab) can show
-- each conversation's most recent message without opening it:
--
--   public.list_my_ride_conversation_previews()
--     Every column of list_my_ride_conversations(), unchanged and in the
--     same order, plus the conversation's newest message:
--       last_message_id         uuid         NULL when there are no messages
--       last_message_sender_id  uuid         NULL when there are no messages
--       last_message_preview    text         first 200 characters of the body
--       last_message_created_at timestamptz  NULL when there are no messages
--
-- Run AFTER: messaging-1-tables.sql (Prototype 9). messaging-2-verify.sql
-- is unaffected and can still be run.
--
-- Why a new function instead of changing list_my_ride_conversations:
--   open_my_ride_conversation returns
--   "select * from list_my_ride_conversations(...)" with a fixed column
--   list. Adding columns to list_my_ride_conversations would mean dropping
--   and re-creating it and would break open_my_ride_conversation. So
--   nothing that already exists is changed; the app calls the new function
--   and, if it isn't installed yet, falls back to the old one (no previews).
--
-- Who can see what:
--   * SECURITY INVOKER, so it runs as the caller (role authenticated) and
--     Row Level Security applies to every table it reads.
--   * Conversations come from list_my_ride_conversations(), which keeps its
--     explicit "auth.uid() in (driver_id, rider_id)" filter AND the
--     ride_conversations RLS policy: only the caller's own chats.
--   * The newest message is read from ride_messages under its RLS policy
--     ("participants read own messages"), and only for those conversations.
--     So a preview can never show a message from someone else's chat.
--   * anon and PUBLIC cannot execute it; only authenticated can.
--   * With no session, auth.uid() is NULL and nothing is returned.
--
-- Safety:
--   * Additive only: no table, column, policy, grant, function or row that
--     already exists is changed, dropped or deleted. No data is written.
--   * Nothing is added to the supabase_realtime publication.
--   * One transaction. Step 0 checks every assumption first and stops with
--     "Nothing was changed." if one doesn't hold, or if this file was
--     already applied.
--   * Uses the existing index ride_messages_conversation_created_idx
--     (conversation_id, created_at, id) to find each newest message.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Pre-flight checks (read-only; stop early instead of guessing)
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.ride_conversations') is null
     or to_regclass('public.ride_messages') is null then
    raise exception 'messaging-3 stopped: messaging-1-tables.sql is not applied (ride_conversations / ride_messages missing). Nothing was changed.';
  end if;

  if to_regprocedure('public.list_my_ride_conversations(uuid)') is null then
    raise exception 'messaging-3 stopped: list_my_ride_conversations(uuid) is missing. Nothing was changed.';
  end if;

  -- The columns this file passes through must be exactly the ones
  -- messaging-1-tables.sql created.
  if pg_get_function_result('public.list_my_ride_conversations(uuid)'::regprocedure)
     is distinct from
     'TABLE(conversation_id uuid, ride_id uuid, driver_id uuid, rider_id uuid, my_role text, '
     'ride_destination text, ride_departure_at timestamp with time zone, state text, '
     'can_send boolean, created_at timestamp with time zone, '
     'last_message_at timestamp with time zone)' then
    raise exception 'messaging-3 stopped: list_my_ride_conversations returns different columns than expected: %. Nothing was changed.',
      pg_get_function_result('public.list_my_ride_conversations(uuid)'::regprocedure);
  end if;

  -- It must still run as the caller (so RLS applies inside it).
  if (select p.prosecdef from pg_proc p
      where p.oid = 'public.list_my_ride_conversations(uuid)'::regprocedure) then
    raise exception 'messaging-3 stopped: list_my_ride_conversations is SECURITY DEFINER; expected SECURITY INVOKER. Nothing was changed.';
  end if;

  -- RLS must be on for both messaging tables.
  if exists (select 1 from pg_class c
             where c.oid in ('public.ride_conversations'::regclass, 'public.ride_messages'::regclass)
               and not c.relrowsecurity) then
    raise exception 'messaging-3 stopped: Row Level Security is off on a messaging table. Nothing was changed.';
  end if;

  -- The message columns this file reads.
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'ride_messages'
        and column_name in ('id', 'conversation_id', 'sender_id', 'body', 'created_at')) <> 5 then
    raise exception 'messaging-3 stopped: ride_messages is missing an expected column. Nothing was changed.';
  end if;

  if to_regprocedure('public.list_my_ride_conversation_previews()') is not null then
    raise exception 'messaging-3 stopped: list_my_ride_conversation_previews already exists (already applied?). Nothing was changed.';
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 1. list_my_ride_conversation_previews  (SECURITY INVOKER: runs under RLS)
-- ---------------------------------------------------------------------
create function public.list_my_ride_conversation_previews()
returns table (
  conversation_id         uuid,
  ride_id                 uuid,
  driver_id               uuid,
  rider_id                uuid,
  my_role                 text,
  ride_destination        text,
  ride_departure_at       timestamptz,
  state                   text,
  can_send                boolean,
  created_at              timestamptz,
  last_message_at         timestamptz,
  last_message_id         uuid,
  last_message_sender_id  uuid,
  last_message_preview    text,
  last_message_created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.conversation_id,
         l.ride_id,
         l.driver_id,
         l.rider_id,
         l.my_role,
         l.ride_destination,
         l.ride_departure_at,
         l.state,
         l.can_send,
         l.created_at,
         l.last_message_at,
         m.id,
         m.sender_id,
         left(m.body, 200),
         m.created_at
  -- The caller's own conversations only (explicit auth.uid() filter + RLS).
  from public.list_my_ride_conversations() l
  -- Newest message first, ties by id: the reverse of the order the
  -- conversation screen shows them in (lib/messageText.js compareMessages).
  left join lateral (
    select rm.id, rm.sender_id, rm.body, rm.created_at
    from public.ride_messages rm
    where rm.conversation_id = l.conversation_id
    order by rm.created_at desc, rm.id desc
    limit 1
  ) m on true
  -- Same order as list_my_ride_conversations.
  order by coalesce(l.last_message_at, l.created_at) desc, l.conversation_id;
$$;

comment on function public.list_my_ride_conversation_previews() is
  'The signed-in user''s ride conversations (same columns as list_my_ride_conversations) plus each one''s newest message (id, sender, first 200 characters, time). SECURITY INVOKER; read-only.';


-- ---------------------------------------------------------------------
-- 2. Privileges
-- ---------------------------------------------------------------------
-- Supabase's default privileges grant new functions to anon and
-- authenticated; take that back, then grant only what's needed.
revoke all on function public.list_my_ride_conversation_previews() from public, anon, authenticated;
grant execute on function public.list_my_ride_conversation_previews() to authenticated;

-- Reload PostgREST's schema cache so the new RPC is callable (delivered
-- only if the COMMIT succeeds).
notify pgrst, 'reload schema';

commit;


-- =====================================================================
-- UNDO (only if asked). Removes the preview function only; no data is
-- stored by this file, so nothing else is lost. The app falls back to
-- list_my_ride_conversations automatically.
-- =====================================================================
-- begin;
-- drop function if exists public.list_my_ride_conversation_previews();
-- commit;
-- notify pgrst, 'reload schema';
