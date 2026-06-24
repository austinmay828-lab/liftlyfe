# LiftLyfe Storage Architecture Report

Last reviewed: 2026-06-23

## Scope

This report documents the current on-device persistence model used by LiftLyfe. It does not modify or migrate any existing data.

The current app is a single-page app that stores user data in browser `localStorage`. There is no client-side database such as IndexedDB, SQLite, or a server-side user data store.

## Storage model

### Storage backend

- Primary store: browser `localStorage`
- Serialization: JSON strings
- Persistence scope: per-browser, per-origin

### Keying strategy

Most app data is stored with a profile prefix:

```text
${profile}_${key}
```

Where `profile` is currently either `austin` or `danielle`.

Example:

```text
austin_workout_sessions
danielle_day_2026-06-23
```

Some keys are global and are not prefixed.

## Current schema

### Global keys

#### `liftlyfe_profile`

- Type: string
- Values: `austin` or `danielle`
- Purpose: active profile selector

#### `liftlyfe_mode`

- Type: string
- Values: `morning`, `gym`, `evening`
- Purpose: active app mode

#### `partner_note_to_<profile>`

- Type: object
- Shape:

```json
{
  "from": "austin",
  "msg": "string",
  "date": "YYYY-MM-DD"
}
```

- Purpose: one-day partner note inbox

### Profile-scoped keys

All keys below are stored as `${profile}_${key}`.

#### `training_programs`

- Type: object
- Current shape:

```json
{
  "austin": {
    "Push 💪": [
      {
        "name": "Lateral Raise",
        "icon": "🏋️",
        "muscle": "Shoulders",
        "sets": 4,
        "reps": "12-15",
        "form": "string",
        "yt": "url",
        "subs": ["Cable lateral raise", "Machine lateral raise"],
        "slotKey": "lateral_raise"
      }
    ]
  },
  "danielle": {
    "Lower + Glutes 🍑": [
      {
        "name": "Romanian Deadlift",
        "icon": "🏋️",
        "muscle": "Glutes/Hams",
        "sets": 4,
        "reps": "10-12",
        "form": "string",
        "yt": "url",
        "subs": ["Stiff leg deadlift", "Good morning"],
        "slotKey": "romanian_deadlift"
      }
    ]
  }
}
```

- Purpose: source-of-truth training templates
- Important caveat:
  - This key is profile-prefixed, but the stored value itself contains both profiles.
  - That means the app can produce separate copies under `austin_training_programs` and `danielle_training_programs`.
  - This is the highest-risk schema inconsistency in the current system.

#### `weekly_plan`

- Type: object
- Shape:

```json
{
  "sunday": "rest",
  "monday": "lift",
  "tuesday": "active",
  "wednesday": "lift",
  "thursday": "active",
  "friday": "lift",
  "saturday": "flex"
}
```

- Purpose: planned day type by weekday

#### `goals`

- Type: object
- Shape:

```json
{
  "cal": 2400,
  "pro": 165,
  "carb": 220,
  "fat": 70,
  "water": 3,
  "steps": 7000,
  "rest": 90
}
```

- Purpose: profile nutrition, hydration, steps, and rest timer goals

#### `workout_sessions`

- Type: array
- Current normalized shape:

```json
[
  {
    "id": "2026-06-23_Push 💪_1719168000000",
    "date": "2026-06-23",
    "createdAt": "2026-06-23T14:25:31.000Z",
    "dayName": "Push 💪",
    "templateName": "Push 💪",
    "exercises": [
      {
        "plannedName": "Rear Delt Fly",
        "actualName": "Cable lateral raise",
        "name": "Cable lateral raise",
        "movementSlot": "rear_delt_fly",
        "notes": "",
        "sets": [
          {
            "setNumber": 1,
            "weight": 60,
            "reps": 12,
            "done": true,
            "rpe": 9,
            "rir": 1
          }
        ],
        "volume": 720,
        "estimated1RM": 84
      }
    ]
  }
]
```

- Purpose: completed workout history and lifting progress source

#### `workout_draft_<dayName>`

- Type: object
- Shape:

```json
{
  "dayName": "Push 💪",
  "date": "2026-06-23",
  "exercises": {
    "0": {
      "0_w": "150",
      "0_r": "8",
      "0_done": true,
      "0_rpe": "9",
      "0_rir": "1",
      "actualName": "Incline Bench Press",
      "notes": "string"
    }
  },
  "completed": {}
}
```

- Purpose: in-progress workout state
- Scope:
  - one key per day name
  - valid only for `date === today()`

#### `weights`

- Type: array
- Shape:

```json
[
  {
    "date": "2026-06-23",
    "w": 294.2,
    "note": "optional"
  }
]
```

- Purpose: bodyweight history

#### `saved_meals`

- Type: array
- Shape:

```json
[
  {
    "name": "Fairlife shake",
    "cal": 150,
    "pro": 30,
    "carb": 4,
    "fat": 2,
    "date": "2026-06-23",
    "source": "exact",
    "serving": "1 bottle",
    "entryKind": "single",
    "nutritionFlow": "exact_lookup",
    "provider": "saved-exact",
    "components": []
  }
]
```

- Purpose: reusable saved food entries

#### `recent_foods`

- Type: array
- Shape:

```json
[
  {
    "name": "Fairlife shake",
    "serving": "1 bottle",
    "cal": 150,
    "pro": 30,
    "carb": 4,
    "fat": 2,
    "source": "exact",
    "entryKind": "single",
    "nutritionFlow": "exact_lookup",
    "provider": "saved-exact",
    "components": [],
    "favorite": true,
    "lastUsed": 1719168000000,
    "count": 4
  }
]
```

- Purpose: recents/favorites library for meals

#### `day_<YYYY-MM-DD>`

- Type: object
- Current normalized shape:

```json
{
  "date": "2026-06-23",
  "dayOfWeek": "Monday",
  "plannedDayType": "lift",
  "actualDayType": "lift",
  "type": "lift",
  "meals": {
    "breakfast": [],
    "lunch": [],
    "dinner": [],
    "snacks": []
  },
  "totals": {
    "calories": 0,
    "protein": 0,
    "carbs": 0,
    "fat": 0,
    "water": 0,
    "activityMinutes": 0,
    "nicotineUses": 0
  },
  "activity": [
    {
      "type": "lifting",
      "minutes": 45,
      "time": "08:15 AM",
      "note": ""
    }
  ],
  "nicotine": [
    {
      "time": "11:02 AM",
      "timestamp": "2026-06-23T15:02:00.000Z"
    }
  ],
  "cal": 0,
  "pro": 0,
  "carb": 0,
  "fat": 0,
  "water": 0,
  "foods": [],
  "supps": {},
  "mood": "",
  "worked_out": true,
  "sleep": "",
  "foodMode": "full",
  "synced": false,
  "steps": 0,
  "hr": 0,
  "workout_cal": 0,
  "workout_min": 0
}
```

- Purpose: daily dashboard state
- Contains:
  - meals
  - daily macro totals
  - water
  - activity
  - nicotine logs
  - supplements, mood, sleep
  - Apple Health sync fields

## Where the requested data lives

### Workout sessions

- Primary store: `${profile}_workout_sessions`
- Related store: `${profile}_workout_draft_<dayName>`
- Related template source: `${profile}_training_programs`

### Exercises

- Planned exercises: `${profile}_training_programs`
- In-progress exercise inputs: `${profile}_workout_draft_<dayName>`
- Completed exercise history: `${profile}_workout_sessions`

### Bodyweight entries

- Primary store: `${profile}_weights`

### Meals

- Per-day meal log: `${profile}_day_<YYYY-MM-DD>`
- Reusable saved foods: `${profile}_saved_meals`
- Recents/favorites: `${profile}_recent_foods`

### Nicotine logs

- Primary store: `${profile}_day_<YYYY-MM-DD>`
- Exact path: `day.<date>.nicotine[]`

### User data

- Active profile: `liftlyfe_profile`
- Active mode: `liftlyfe_mode`
- Profile goals: `${profile}_goals`
- Weekly schedule: `${profile}_weekly_plan`
- Partner note inbox: `partner_note_to_<profile>`
- Day-level state: `${profile}_day_<YYYY-MM-DD>`

## Relationships between keys

### Workout relationships

- `training_programs` defines planned workout days and exercises.
- `workout_draft_<dayName>` references exercises by array index within a planned day.
- `workout_sessions` is generated from the draft plus the planned day template.
- `workout_sessions.exercises[].movementSlot` retains a structural link back to the original planned slot.
- `plannedName` preserves template intent.
- `actualName` and `name` preserve the performed exercise.

### Daily relationships

- `day_<date>` is the dashboard aggregate record.
- Meals inside `day_<date>.meals` feed `day_<date>.totals`.
- `worked_out` inside `day_<date>` is a coarse summary only.
- Full lifting history is not stored in `day_<date>`; it lives in `workout_sessions`.

### Nutrition relationships

- `saved_meals` is a reusable reference library.
- `recent_foods` is a derived recents/favorites library.
- `day_<date>.meals` is the actual day log.
- Data is duplicated intentionally between these keys for UX reasons.

### Bodyweight relationships

- `weights` is standalone.
- Bodyweight is not linked directly to workout sessions in storage; relationships are created in the UI by comparing dates.

## Areas where data could be lost during updates

### 1. Divergent `training_programs` copies

Risk:

- Because `training_programs` is profile-prefixed and also stores both profiles in the value, the app can create:
  - `austin_training_programs`
  - `danielle_training_programs`
- These may diverge over time.

Impact:

- One profile could read a stale copy of the other profile’s program depending on which key is loaded.

### 2. Date-key schema changes

Risk:

- Daily records are keyed as `${profile}_day_<YYYY-MM-DD>`.
- Any change to date formatting, timezone logic, or prefix rules would strand old data.

Impact:

- Meals, nicotine logs, dashboard history, sleep, and activity could appear missing after an update.

### 3. Draft key naming changes

Risk:

- Workout drafts are keyed by day name text: `${profile}_workout_draft_<dayName>`.
- Renaming a workout day or changing emoji/title text changes the key namespace.

Impact:

- In-progress workouts can become inaccessible even though data still exists.

### 4. Normalization overwrites

Risk:

- `ensureDayData()` rebuilds the `totals` object and other normalized fields each save.

Impact:

- Unknown nested fields inside `totals` can be dropped during future code changes if not explicitly carried forward.

### 5. Cross-key duplication

Risk:

- Meal data exists in:
  - `day_<date>.meals`
  - `saved_meals`
  - `recent_foods`

Impact:

- A partial migration could update one source and not the others, causing inconsistent UI behavior.

### 6. Global key exceptions

Risk:

- `liftlyfe_profile`, `liftlyfe_mode`, and `partner_note_to_<profile>` are not profile-prefixed with the same helper.

Impact:

- A bulk migration that assumes all app keys are prefixed could miss these records.

### 7. Bodyweight same-day overwrite

Risk:

- `weights` currently keeps one entry per day and overwrites the same date.

Impact:

- A user can lose multiple weigh-ins from the same day by design.
- This is current behavior, not a bug, but it matters for migration expectations.

### 8. Storage quota / clear-site-data risk

Risk:

- `localStorage` is small and browser-managed.
- Safari storage eviction, private browsing limitations, or manual “Clear Website Data” wipes everything.

Impact:

- Full data loss with no server recovery path.

## Recommended migration approach

### Principle

Treat every schema update as a versioned migration of a local document store, not as ad hoc key reads/writes.

### Recommended steps

#### 1. Add a storage manifest key

Add one global manifest key:

```text
liftlyfe_storage_manifest
```

Suggested shape:

```json
{
  "schemaVersion": 1,
  "lastBackupAt": "ISO timestamp",
  "lastMigrationAt": "ISO timestamp",
  "profiles": ["austin", "danielle"]
}
```

#### 2. Migrate by version, not by feature flag

On app startup:

1. Load manifest
2. Detect current schema version
3. Run ordered migration steps
4. Write migrated data atomically
5. Update manifest version only after success

#### 3. Always back up before migration

Before running any migration:

1. Enumerate all LiftLyfe-owned keys
2. Export them as one JSON snapshot
3. Save the snapshot under a backup namespace or download it
4. Only then mutate live keys

#### 4. Use copy-forward migrations

Avoid mutating objects in place where possible.

Preferred pattern:

1. Read old key
2. Normalize into new shape
3. Write new object
4. Validate required fields
5. Remove old key only after successful validation

#### 5. Preserve unknown fields

When migrating document-shaped data:

- copy all unknown top-level fields forward
- preserve nested unknown fields where possible
- never rebuild a record from only the fields the current UI uses

#### 6. Consolidate `training_programs`

Recommended future migration:

- move `training_programs` to one global key, not profile-prefixed
- or split to:
  - `${profile}_training_program`
  - one profile only per key

Do not keep the current hybrid model long-term.

#### 7. Add validation after migration

For each migrated dataset, validate:

- workout sessions are arrays
- each session has `date`, `createdAt`, `dayName`, `exercises`
- each exercise has resolved performed name plus `plannedName`
- weights have `date` and `w`
- daily records have `meals`, `activity`, `nicotine`, and `totals`

## Backup strategy

### What to back up

Back up every LiftLyfe-owned key:

- `liftlyfe_profile`
- `liftlyfe_mode`
- `partner_note_to_austin`
- `partner_note_to_danielle`
- all keys matching:
  - `austin_*`
  - `danielle_*`

### Backup format

Recommended export format:

```json
{
  "app": "LiftLyfe",
  "exportedAt": "ISO timestamp",
  "origin": "window.location.origin",
  "schemaVersion": 1,
  "keys": {
    "austin_workout_sessions": [...],
    "austin_day_2026-06-23": {...},
    "danielle_weights": [...],
    "liftlyfe_profile": "austin"
  }
}
```

### Backup frequency

Recommended:

- before every release that changes persistence code
- manual user export on demand
- optional reminder after meaningful new data is added

## Export/import backup capability

### Recommended export behavior

Add a Settings action:

- `Export My Data`

Behavior:

1. Read all LiftLyfe-owned keys
2. Bundle into one JSON document
3. Download as:

```text
liftlyfe-backup-YYYY-MM-DDTHH-mm-ss.json
```

### Recommended import behavior

Add a Settings action:

- `Import Backup`

Behavior:

1. User selects exported JSON
2. Validate app name and structure
3. Show preview of keys and counts
4. Require explicit confirmation
5. Import into a temporary map first
6. Write live keys only after validation succeeds

### Safe import rules

- Never merge blindly
- Offer:
  - replace all LiftLyfe data
  - import missing keys only
  - restore one profile only
- Always create a pre-import snapshot before writing

## Recommended near-term protection work

Priority order:

1. Add JSON export of all LiftLyfe keys
2. Add storage manifest with schema version
3. Normalize and migrate `training_programs`
4. Add pre-migration snapshot logic
5. Add JSON import with validation and rollback behavior

## Summary

The current system is a localStorage document store with these main domains:

- completed lifting history in `workout_sessions`
- workout drafts in `workout_draft_<dayName>`
- bodyweight in `weights`
- daily dashboard state in `day_<YYYY-MM-DD>`
- meal libraries in `saved_meals` and `recent_foods`
- profile and mode state in global keys

The most important risk is not current day-to-day use. It is schema drift during future updates, especially:

- profile-prefixed `training_programs` storing both profiles
- date-based key changes
- duplicated nutrition data across daily and library keys
- lack of built-in export/import

The safest path forward is versioned migrations plus full-key JSON backup/export before any storage change.
