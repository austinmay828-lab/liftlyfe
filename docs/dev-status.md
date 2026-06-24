# LiftLyfe Dev Status

Last updated: 2026-06-24

## Current app storage model

LiftLyfe currently stores user data in browser `localStorage`. There is no server-side user database.

Primary persisted domains:

- `workout_sessions`
  - completed workout history
  - stored per profile
- `workout_draft_<dayName>`
  - in-progress workout inputs
  - stored per profile
- `weights`
  - bodyweight history
  - stored per profile
- `day_<YYYY-MM-DD>`
  - daily dashboard record
  - includes meals, nicotine, water, activity, mood, sleep, and summary totals
  - stored per profile
- `saved_meals`
  - reusable foods
  - stored per profile
- `recent_foods`
  - recents/favorites meal library
  - stored per profile
- `goals`
  - calorie/protein/water/rest defaults
  - stored per profile
- `weekly_plan`
  - planned lift/rest/active day layout
  - stored per profile
- `training_programs`
  - workout templates and substitution options
  - currently profile-prefixed, but the stored object contains both profiles

Global keys:

- `liftlyfe_profile`
- `liftlyfe_mode`
- `partner_note_to_<profile>`

Reference:
- [storage-architecture-report.md](/Users/austin/liftlyfe/docs/storage-architecture-report.md)

## Auth status

LiftLyfe now has a narrow server-side protection layer for public exposure:

- shared password env var:
  - `LIFTLYFE_PASSWORD`
- signed trusted-device session env var:
  - `LIFTLYFE_SESSION_SECRET`

Protected routes:

- `GET /`
- `GET /index.html`
- `GET /app-config.js`
- `POST /api/gains`
- `POST /api/nutrition/analyze`

Current behavior:

- if `LIFTLYFE_PASSWORD` is unset, no auth gate is applied
- if `LIFTLYFE_PASSWORD` is set:
  - initial access can be authenticated
  - successful login can set an HTTP-only signed session cookie
  - trusted devices stay signed in for up to 30 days
- the password is not stored in `localStorage`
- the password is not exposed to frontend JavaScript

## Known risks

1. `training_programs` schema is still awkward
   - the key is profile-prefixed, but the stored object contains both profiles
   - this can create divergence between `austin_training_programs` and `danielle_training_programs`

2. Local browser storage is still the source of truth
   - clearing browser storage wipes private workout/bodyweight/meal/nicotine history
   - there is no server-side recovery

3. Backup exports are sensitive
   - exported JSON contains full private local data
   - users must not commit or share backup files casually

4. Public deployment still depends on env hygiene
   - `.env` must stay untracked
   - password and session secret must never be committed

5. `/healthz` remains public
   - this is acceptable operationally, but it does advertise that the service is running

## Next recommended steps

1. Verify password/session auth in a real browser and with curl
2. Keep using the export backup flow before schema changes
3. Strengthen `.gitignore` further for backup files and extra env variants
4. Normalize the `training_programs` storage shape before larger product work
5. If ngrok/public hosting continues, add rate limiting around protected POST routes
