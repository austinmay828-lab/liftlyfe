# LiftLyfe

LiftLyfe is a single-page gym app served by a minimal Node server. The app keeps workout history, dashboard state, and local tracking in `localStorage`, while AI-backed features stay behind server-side endpoints so the API key never reaches the browser.

## Current architecture

- `index.html`: single-file SPA for workouts, dashboard, and food logging
- `server.js`: Node HTTP server that serves the SPA and exposes:
- `POST /api/gains`: workout/coach chat
- `POST /api/nutrition/analyze`: nutrition-provider meal analysis for exact branded lookup and estimated mixed meals
- `.env`: local runtime config and secrets

The simplest production shape is one Node web service that serves both the frontend and backend from the same origin. That avoids CORS, avoids hardcoded `localhost`, and is the cheapest setup because there is only one thing to host.

## Local setup

1. Copy the example env file:

```bash
cp .env.example .env
```

2. Fill in `OPENAI_API_KEY` in `.env`.

If you want to protect the app behind a shared password, also set:

```env
LIFTLYFE_PASSWORD=choose_a_shared_password_here
LIFTLYFE_SESSION_SECRET=choose_a_long_random_session_secret_here
```

3. Start the app:

```bash
npm start
```

4. Open the app:

```text
http://localhost:3000
```

## Test over local Wi-Fi

1. Make sure your Mac and phones are on the same Wi-Fi.
2. In `.env`, set:

```env
HOST=0.0.0.0
PORT=3000
PUBLIC_APP_URL=http://YOUR_LAN_IP:3000
```

3. Start the app with `npm start`.
4. Open `http://YOUR_LAN_IP:3000` on each phone.

If macOS Firewall is enabled, allow `node` to accept incoming connections.

If both `LIFTLYFE_PASSWORD` and `LIFTLYFE_SESSION_SECRET` are set, the app will show a simple password page on first visit and then keep the device signed in with an HTTP-only signed session cookie for up to 30 days.

## Protecting ngrok / public exposure

When exposing LiftLyfe through ngrok or any public URL, set a shared password in `.env`:

```env
LIFTLYFE_PASSWORD=choose_a_shared_password_here
LIFTLYFE_SESSION_SECRET=choose_a_long_random_session_secret_here
```

Protected routes:

- `GET /`
- `GET /index.html`
- `GET /app-config.js`
- `POST /api/gains`
- `POST /api/nutrition/analyze`

Unprotected route:

- `GET /healthz`

If `LIFTLYFE_PASSWORD` is blank or unset, no password gate is applied.

If `LIFTLYFE_PASSWORD` is set but `LIFTLYFE_SESSION_SECRET` is missing, Basic Auth still works, but trusted-device cookie sessions will not.

### Trusted device behavior

- First browser visit to `/` shows a password form
- Successful login sets an HTTP-only signed cookie
- Protected routes accept either:
  - a valid session cookie
  - valid HTTP Basic Auth credentials
- Session duration: 30 days
- The shared password is never stored in `localStorage` and is never exposed to frontend JavaScript

### Testing the browser flow

1. Set both env vars:

```env
LIFTLYFE_PASSWORD=choose_a_shared_password_here
LIFTLYFE_SESSION_SECRET=choose_a_long_random_session_secret_here
```

2. Restart the server:

```bash
npm start
```

3. Open `http://localhost:3000`
4. You should see the LiftLyfe password page
5. Enter the shared password
6. After login, you should be redirected into the app
7. Refresh the browser
8. The app should stay unlocked without asking again

### Quick auth test

Without credentials, protected routes should return `401`:

```bash
curl -i http://localhost:3000/
curl -i http://localhost:3000/app-config.js
curl -i -X POST http://localhost:3000/api/gains -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"test"}]}'
```

With credentials, protected routes should succeed:

```bash
curl -i -u anyuser:your_password http://localhost:3000/
curl -i -u anyuser:your_password http://localhost:3000/app-config.js
curl -i -u anyuser:your_password -X POST http://localhost:3000/api/nutrition/analyze -H 'Content-Type: application/json' -d '{"message":"Fairlife shake"}'
```

You can also test the login form and session cookie with curl:

```bash
curl -i -c cookies.txt -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'password=your_password'

curl -i -b cookies.txt http://localhost:3000/
curl -i -b cookies.txt http://localhost:3000/app-config.js
```

## Production deployment

Use one Node web service. Do not split the frontend and backend unless you need to later.

Recommended path:

1. Push this repo to GitHub.
2. Deploy it as a single Node service on a low-cost host such as Render, Railway, or Fly.io.
3. Set these environment variables in the host:

```env
OPENAI_API_KEY=your_openai_api_key_here
LIFTLYFE_PASSWORD=choose_a_shared_password_here
LIFTLYFE_SESSION_SECRET=choose_a_long_random_session_secret_here
GAINS_MODEL=gpt-4.1-mini
PUBLIC_APP_URL=https://your-app-domain.example
API_BASE_URL=
```

4. Set the start command to:

```bash
npm start
```

Because the SPA and API are served together, the frontend will call the backend on the same origin in both local and production environments.

## Optional separate frontend/backend hosting

If you later host the HTML somewhere else, set:

```env
API_BASE_URL=https://your-backend-domain.example
PUBLIC_APP_URL=https://your-frontend-domain.example
```

The SPA will read those values from `/app-config.js` at runtime.

## Health check

For local or hosted checks:

```text
GET /healthz
```

## Notes

- Do not commit `.env`.
- Do not commit your shared password.
- Do not commit your session signing secret.
- Do not put API keys in `index.html` or in the browser.
- Workout tracking and local data stay on-device in `localStorage`.
- AI features require the backend to be reachable.
