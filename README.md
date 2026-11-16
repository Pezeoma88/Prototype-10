# CarpoolBoard — Prototype 10

CarpoolBoard is a mobile ride-coordination app built with Expo, React Native, and Supabase. It is designed to help Southern Methodist University (SMU) students find transportation to campus events, meetings, and off-campus activities.

Drivers can post available rides, select pickup locations, and manage passenger requests. Riders can browse available rides and request seats. Drivers decide whether to accept or decline requests, and accepted participants can communicate through private messaging.

## What's New in Prototype 10

Prototype 10 builds on Prototype 9, which introduced ride messaging. This iteration improves the app's usability, accessibility, and map experience based on previous testing and feedback.

### 1. Map Improvements and Suggested Meeting Spots

The map now displays nine suggested meeting spots around SMU, even when no rides have been posted.

- Added suggested pickup landmarks around campus.
- Introduced distinct map markers to separate suggested locations from actual rides.
- Added a collapsible list of suggested meeting spots.
- Users can tap a suggested location to view its details and center the map.
- Suggested locations are clearly identified so users do not confuse them with available rides.

These changes address user feedback that the map appeared empty when no rides were available.

### 2. Accessibility Mode

Added and improved accessibility settings to make CarpoolBoard easier to use for people with different visual, physical, and cognitive needs.

Accessibility options include:

- **Text Size:** Allows users to increase text size for improved readability.
- **High Contrast:** Provides stronger visual contrast in both light and dark themes.
- **Simplified Interface:** Reduces visual complexity and makes important actions easier to identify.
- **Reduce Motion:** Reduces animations and unnecessary movement throughout supported interactions.

Accessibility preferences are saved so users do not need to configure them every time they reopen the app.

### 3. Messaging Improvements

Improved the messaging experience introduced in Prototype 9.

- Added conversation previews that display the latest message.
- Improved the presentation of messaging information.
- Continued supporting private conversations between accepted drivers and riders.

### 4. Testing and Reliability

Prototype 10 includes additional automated tests covering:

- Suggested meeting spots and map interactions.
- High Contrast themes.
- Simplified Interface behavior.
- Accessibility settings and preference handling.

The latest automated test run reported **498 passing tests**.

The updated features were also tested manually using Expo Go on an iPhone, including different accessibility settings and map interactions.

## How CarpoolBoard Works

1. **Sign in:** Students create an account or sign in.
2. **Choose a role:** Users can interact with the app as a driver or rider.
3. **Post a ride:** Drivers enter their destination, departure time, pickup location, and available seats.
4. **Request a seat:** Riders browse rides and submit requests.
5. **Manage requests:** Drivers accept or decline incoming requests.
6. **Communicate:** Accepted drivers and riders can message each other privately.
7. **Explore the map:** Users can view available rides and suggested SMU meeting spots.

## Technology Stack

| Technology | Purpose |
| --- | --- |
| React Native | Mobile application interface |
| Expo | Development, testing, and distribution |
| JavaScript | Application functionality |
| Supabase Auth | Account registration and authentication |
| Supabase Postgres | Ride, user, request, and messaging data |
| Supabase Storage | File and image storage |
| Jest | Automated testing |
| EAS Build | Android application builds |
| EAS Update | Over-the-air application updates |

## Getting Started

### Requirements

- Node.js and npm
- Expo Go or a compatible development build
- Supabase project credentials

### Testing

Click the Expo link or scan the QR Code
https://expo.dev/preview/update?message=Prototype+10+-+User+Testing&updateRuntimeVersion=1.1.0&createdAt=2026-11-16T20%3A11%3A35.295Z&slug=exp&projectId=0e5d81b8-c9ef-4e3a-873f-83c78eb6d72c&group=025fd7cd-f67d-4f91-80e9-abc907799c64

<img width="207" height="208" alt="Screenshot 2026-11-16 at 2 18 10 PM" src="https://github.com/user-attachments/assets/874e5fa1-3ddc-4a35-9a5c-c5992d344b2a" />







For Android users click the link or Scan the QR Code
https://expo.dev/accounts/smu-c3-mobile-fall-26/projects/CarpoolBoard/builds/756d1d8c-1364-47e6-bb01-bce1a0a6a9fa

<img width="311" height="316" alt="Screenshot 2026-11-16 at 2 15 54 PM" src="https://github.com/user-attachments/assets/a1c3d61f-1869-480c-8b93-61805aeac71d" />



## Author

Developed as part of the Mobile App Development course at Southern Methodist University.

**GitHub Repository:** https://github.com/Pezeoma88/Prototype-10
