# CarpoolBoard — Prototype 10

CarpoolBoard is an Expo / React Native app for SMU students to post and request rides. Drivers post rides with pickup landmarks, riders request seats, and drivers accept or deny requests. Accepted drivers and riders can message each other privately.

Prototype 10 builds on the completed Prototype 9 (ride messaging). This prototype focuses on improving messaging:

- Unread message indicators
- Better conversation previews (last message text)
- Notifications for new messages
- Notifications when a ride request is accepted

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL and publishable key
npx expo start
```

Run the tests:

```bash
npm test
```

## Project layout

| Path | Contents |
| --- | --- |
| `App.js` | App state, data loading, and navigation between screens |
| `screens/` | Full screens (Home, Map, Requests, Conversation, Profile, …) |
| `components/` | Reusable UI pieces |
| `lib/` | Supabase client, data helpers, messaging, and formatting |
| `supabase/` | SQL scripts and the `username-sign-in` Edge Function |
| `__tests__/` | Jest tests |
| `theme/` | Colors, spacing, and typography |

## Backend

The app uses Supabase (Auth, Postgres with Row Level Security, Storage). Only the publishable key is used in the app. Real values belong in `.env.local`, which Git ignores.

## History

- Prototype 9 repository: https://github.com/Pezeoma88/Prototype-9
- Prototype 9 documents kept for reference: `PROTOTYPE-9-TEST-PLAN.md`, `PROTOTYPE-9-EDGE-CASES.md`
