const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

loadEnvFile(path.join(__dirname, '.env'));

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const INDEX_PATH = path.join(__dirname, 'index.html');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = process.env.GAINS_MODEL || 'gpt-4.1-mini';
const API_BASE_URL = normalizeBaseUrl(process.env.API_BASE_URL || '');
const PUBLIC_APP_URL = normalizeBaseUrl(process.env.PUBLIC_APP_URL || '');
const LIFTLYFE_PASSWORD = typeof process.env.LIFTLYFE_PASSWORD === 'string' ? process.env.LIFTLYFE_PASSWORD : '';
const LIFTLYFE_SESSION_SECRET = typeof process.env.LIFTLYFE_SESSION_SECRET === 'string' ? process.env.LIFTLYFE_SESSION_SECRET : '';
const BASIC_AUTH_REALM = 'LiftLyfe';
const SESSION_COOKIE_NAME = 'liftlyfe_session';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const MIXED_MEAL_ANALYSIS_INSTRUCTIONS = `You analyze natural-language meal descriptions for lightweight food logging.
Return JSON only.
Use this exact schema:
{"name":"string","serving":"string","components":[{"name":"string","serving":"string","calories":number,"protein":number,"carbs":number,"fat":number}],"total":{"calories":number,"protein":number,"carbs":number,"fat":number}}
Rules:
- Break mixed meals into likely components when practical.
- Prefer common-sense portion estimates; do not require exact weights.
- Keep it useful for real people, not dietitians.
- If the meal is simple, components can still be one item.
- Never include markdown, explanation, or extra keys.`;

const BRANDED_FOOD_CATALOG = [
  { aliases: ['fairlife core power 26g', 'fairlife core power'], name: 'Fairlife Core Power', serving: '1 bottle', calories: 170, protein: 26, carbs: 8, fat: 4 },
  { aliases: ['fairlife nutrition plan', 'fairlife shake'], name: 'Fairlife Nutrition Plan', serving: '1 bottle', calories: 150, protein: 30, carbs: 4, fat: 2 },
  { aliases: ['premier protein'], name: 'Premier Protein Shake', serving: '1 bottle', calories: 160, protein: 30, carbs: 5, fat: 3 },
  { aliases: ['oikos triple zero', 'oikos pro'], name: 'Oikos Triple Zero', serving: '1 container', calories: 120, protein: 15, carbs: 10, fat: 0 },
  { aliases: ['chobani zero'], name: 'Chobani Zero Sugar', serving: '1 container', calories: 60, protein: 11, carbs: 5, fat: 0 },
  { aliases: ['quest bar'], name: 'Quest Protein Bar', serving: '1 bar', calories: 200, protein: 20, carbs: 21, fat: 8 },
  { aliases: ['gatorade zero'], name: 'Gatorade Zero', serving: '1 bottle', calories: 0, protein: 0, carbs: 0, fat: 0 },
];

const MIXED_MEAL_COMPONENT_CATALOG = [
  { aliases: ['tortilla', 'flour tortilla', 'wrap'], serving: '1 tortilla', calories: 140, protein: 4, carbs: 24, fat: 4 },
  { aliases: ['chicken', 'grilled chicken', 'chicken breast'], serving: '1 palm / 4 oz', calories: 180, protein: 34, carbs: 0, fat: 4 },
  { aliases: ['cheese', 'shredded cheese', 'cheddar'], serving: '1 oz', calories: 110, protein: 7, carbs: 1, fat: 9 },
  { aliases: ['bbq sauce', 'barbecue sauce'], serving: '2 tbsp', calories: 60, protein: 0, carbs: 14, fat: 0 },
  { aliases: ['rice'], serving: '1 cup', calories: 205, protein: 4, carbs: 45, fat: 0 },
  { aliases: ['beans', 'black beans', 'pinto beans'], serving: '1/2 cup', calories: 120, protein: 7, carbs: 20, fat: 1 },
  { aliases: ['egg', 'eggs'], serving: '1 egg', calories: 70, protein: 6, carbs: 0, fat: 5 },
  { aliases: ['toast', 'bread'], serving: '2 slices', calories: 180, protein: 6, carbs: 30, fat: 2 },
  { aliases: ['banana'], serving: '1 medium', calories: 105, protein: 1, carbs: 27, fat: 0 },
  { aliases: ['oatmeal', 'oats'], serving: '1 packet / 1 cup', calories: 150, protein: 5, carbs: 27, fat: 3 },
  { aliases: ['ground beef', 'burger patty', 'burger'], serving: '1 patty / 4 oz', calories: 280, protein: 24, carbs: 0, fat: 20 },
  { aliases: ['salad'], serving: '1 bowl', calories: 220, protein: 12, carbs: 14, fat: 12 },
  { aliases: ['pizza'], serving: '1 slice', calories: 285, protein: 12, carbs: 36, fat: 10 },
  { aliases: ['taco'], serving: '1 taco', calories: 180, protein: 9, carbs: 15, fat: 9 },
  { aliases: ['pasta'], serving: '1 bowl', calories: 420, protein: 14, carbs: 62, fat: 12 },
  { aliases: ['sandwich'], serving: '1 sandwich', calories: 420, protein: 24, carbs: 38, fat: 18 },
  { aliases: ['bowl'], serving: '1 bowl', calories: 650, protein: 35, carbs: 60, fat: 20 },
  { aliases: ['yogurt'], serving: '1 container', calories: 140, protein: 15, carbs: 10, fat: 2 },
  { aliases: ['shake'], serving: '1 bottle', calories: 170, protein: 28, carbs: 8, fat: 4 },
];

const MIXED_MEAL_CONNECTORS = /\band\b|,|\+|\bwith\b|\binside\b|\bon\b|\bin\b|\bside of\b/i;
const MIXED_MEAL_INTRO_PHRASES = /\bi ate\b|\bi had\b|\bfor breakfast\b|\bfor lunch\b|\bfor dinner\b|\bmeal was\b|\bmeal is\b/i;
const BRANDED_CUES = ['core power', 'fairlife', 'premier protein', 'oikos', 'chobani', 'quest', 'gatorade zero'];
const PACKAGED_FORM_CUES = ['bar', 'bottle', 'shake', 'container', 'cup', 'pack', 'packet', 'protein'];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) continue;
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function normalizeBaseUrl(value) {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function sendJs(res, statusCode, source) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(source);
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(html);
}

function sendUnauthorized(res) {
  res.writeHead(401, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'WWW-Authenticate': `Basic realm="${BASIC_AUTH_REALM}", charset="UTF-8"`,
  });
  res.end(JSON.stringify({ error: 'Authentication required.' }));
}

function renderLoginPage(errorMessage = '') {
  const safeMessage = errorMessage
    ? `<div style="margin-bottom:16px;padding:12px 14px;border-radius:12px;background:#2a1515;border:1px solid rgba(248,113,113,0.35);color:#fca5a5;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${escapeHtml(errorMessage)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LiftLyfe Login</title>
<style>
  :root{color-scheme:dark;}
  *{box-sizing:border-box;}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:linear-gradient(180deg,#151519 0%,#0d0d0f 100%);color:#f5f5f5;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  .card{width:100%;max-width:360px;background:#141416;border:1px solid rgba(255,255,255,0.08);border-radius:18px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.45);}
  .logo{font-size:24px;font-weight:700;letter-spacing:-0.03em;margin-bottom:8px;}
  .logo em{font-style:normal;color:#7ee8a2;}
  .sub{font-size:14px;line-height:1.6;color:#9a9a9f;margin-bottom:20px;}
  label{display:block;font-size:12px;color:#9a9a9f;margin-bottom:8px;font-weight:600;letter-spacing:.02em;}
  input{width:100%;padding:14px 16px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:#1a1a1d;color:#f5f5f5;font-size:15px;margin-bottom:16px;}
  button{width:100%;padding:14px 16px;border:none;border-radius:12px;background:#7ee8a2;color:#0d0d0f;font-size:15px;font-weight:700;cursor:pointer;}
  .note{margin-top:14px;font-size:12px;line-height:1.5;color:#5a5a60;}
</style>
</head>
<body>
  <div class="card">
    <div class="logo">Lift<em>Lyfe</em></div>
    <div class="sub">Enter the shared password to unlock this device. A trusted session will stay signed in for up to 30 days.</div>
    ${safeMessage}
    <form method="POST" action="/auth/login">
      <label for="password">Shared Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button type="submit">Unlock LiftLyfe</button>
    </form>
    <div class="note">The password is verified on the server. It is not stored in localStorage or exposed to frontend JavaScript.</div>
  </div>
</body>
</html>`;
}

function safeCompareStrings(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function parseBasicAuthHeader(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const match = headerValue.match(/^Basic\s+(.+)$/i);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) return null;
    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch (error) {
    return null;
  }
}

function isProtectedRoute(method, pathname) {
  return (
    (method === 'GET' && (pathname === '/' || pathname === '/index.html' || pathname === '/app-config.js')) ||
    (method === 'POST' && (pathname === '/api/gains' || pathname === '/api/nutrition/analyze'))
  );
}

function isAuthorizedRequest(req) {
  if (!LIFTLYFE_PASSWORD) return true;
  if (validateSessionCookie(req)) return true;
  const credentials = parseBasicAuthHeader(req.headers.authorization);
  if (!credentials) return false;
  return safeCompareStrings(credentials.password, LIFTLYFE_PASSWORD);
}

async function handleAuthLogin(req, res) {
  if (!LIFTLYFE_PASSWORD) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  if (!LIFTLYFE_SESSION_SECRET) {
    sendHtml(res, 500, renderLoginPage('Missing LIFTLYFE_SESSION_SECRET on the server. Set it before using trusted-device sessions.'));
    return;
  }

  let parsedPassword = '';
  try {
    const rawBody = await readBody(req);
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    if (contentType.includes('application/json')) {
      const parsed = rawBody ? JSON.parse(rawBody) : {};
      parsedPassword = typeof parsed.password === 'string' ? parsed.password : '';
    } else {
      const params = new URLSearchParams(rawBody);
      parsedPassword = params.get('password') || '';
    }
  } catch (error) {
    sendHtml(res, 400, renderLoginPage('Invalid login request.'));
    return;
  }

  if (!safeCompareStrings(parsedPassword, LIFTLYFE_PASSWORD)) {
    clearSessionCookie(res, req);
    sendHtml(res, 401, renderLoginPage('Incorrect shared password.'));
    return;
  }

  attachSessionCookie(res, req);
  res.writeHead(302, {
    Location: '/',
    'Cache-Control': 'no-store',
  });
  res.end();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function signSessionPayload(payload) {
  return crypto.createHmac('sha256', LIFTLYFE_SESSION_SECRET).update(payload).digest('base64url');
}

function createSessionCookieValue() {
  const payload = JSON.stringify({ exp: Date.now() + SESSION_MAX_AGE_MS });
  const encodedPayload = Buffer.from(payload, 'utf8').toString('base64url');
  const signature = signSessionPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return header.split(';').reduce((acc, part) => {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) return acc;
    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    acc[name] = value;
    return acc;
  }, {});
}

function validateSessionCookie(req) {
  if (!LIFTLYFE_SESSION_SECRET) return false;
  const cookies = parseCookies(req);
  const rawValue = cookies[SESSION_COOKIE_NAME];
  if (!rawValue) return false;
  const separatorIndex = rawValue.lastIndexOf('.');
  if (separatorIndex === -1) return false;
  const encodedPayload = rawValue.slice(0, separatorIndex);
  const providedSignature = rawValue.slice(separatorIndex + 1);
  const expectedSignature = signSessionPayload(encodedPayload);
  if (!safeCompareStrings(providedSignature, expectedSignature)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    return Number.isFinite(payload?.exp) && payload.exp > Date.now();
  } catch (error) {
    return false;
  }
}

function shouldUseSecureCookies(req) {
  return req.socket?.encrypted || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function attachSessionCookie(res, req) {
  if (!LIFTLYFE_SESSION_SECRET) return;
  const sessionValue = createSessionCookieValue();
  const parts = [
    `${SESSION_COOKIE_NAME}=${sessionValue}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}`,
    `Expires=${new Date(Date.now() + SESSION_MAX_AGE_MS).toUTCString()}`,
  ];
  if (shouldUseSecureCookies(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res, req) {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (shouldUseSecureCookies(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function needsLoginPage(req, pathname) {
  return req.method === 'GET' && (pathname === '/' || pathname === '/index.html');
}

function extractResponseText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text;
  }

  if (Array.isArray(data?.output)) {
    for (const item of data.output) {
      if (!Array.isArray(item?.content)) continue;
      for (const part of item.content) {
        if (part?.type === 'output_text' && typeof part.text === 'string' && part.text.trim()) {
          return part.text;
        }
      }
    }
  }

  return '';
}

function serializeResponsesMessage(message) {
  const role = message?.role === 'assistant' ? 'assistant' : 'user';
  const text =
    typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content ?? '');

  return {
    role,
    content: [
      {
        type: role === 'assistant' ? 'output_text' : 'input_text',
        text,
      },
    ],
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handleGains(req, res) {
  if (!OPENAI_API_KEY) {
    sendJson(res, 500, {
      error: 'Missing OPENAI_API_KEY on the server.',
    });
    return;
  }

  let parsed;
  try {
    const rawBody = await readBody(req);
    parsed = rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
    sendJson(res, 400, {
      error: 'Invalid JSON request body.',
    });
    return;
  }

  const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
  const system = typeof parsed.system === 'string' ? parsed.system : '';
  const maxTokens = Number.isFinite(parsed.max_tokens) ? parsed.max_tokens : 800;
  const model = typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : DEFAULT_MODEL;

  if (messages.length === 0) {
    sendJson(res, 400, {
      error: 'Messages are required.',
    });
    return;
  }

  try {
    const apiRes = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        max_output_tokens: maxTokens,
        instructions: system,
        input: messages.map(serializeResponsesMessage),
      }),
    });

    const data = await apiRes.json().catch(() => ({}));

    if (!apiRes.ok) {
      sendJson(res, apiRes.status, {
        error: data?.error?.message || data?.error || 'Upstream model request failed.',
      });
      return;
    }

    sendJson(res, 200, {
      content: [
        {
          text: extractResponseText(data),
        },
      ],
      raw: data,
    });
  } catch (error) {
    sendJson(res, 502, {
      error: 'Unable to reach the model provider.',
    });
  }
}

function roundMacro(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function normalizeFoodText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseQuantityMultiplier(text) {
  const normalized = normalizeFoodText(text);
  const quantityMatch = normalized.match(/^(\d+(?:\.\d+)?)(x)?\s*/);
  return {
    quantity: quantityMatch ? parseFloat(quantityMatch[1]) : 1,
    cleaned: normalized.replace(/^(\d+(?:\.\d+)?)(x)?\s*/, '').trim() || normalized,
  };
}

function sumNutrition(items) {
  return items.reduce(
    (acc, item) => ({
      calories: acc.calories + roundMacro(item.calories),
      protein: acc.protein + roundMacro(item.protein),
      carbs: acc.carbs + roundMacro(item.carbs),
      fat: acc.fat + roundMacro(item.fat),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function sanitizeNutritionComponent(raw, fallbackName = 'Item') {
  const component = raw && typeof raw === 'object' ? raw : {};
  return {
    name: typeof component.name === 'string' && component.name.trim() ? component.name.trim() : fallbackName,
    serving: typeof component.serving === 'string' ? component.serving.trim() : '',
    calories: roundMacro(component.calories),
    protein: roundMacro(component.protein),
    carbs: roundMacro(component.carbs),
    fat: roundMacro(component.fat),
  };
}

function sanitizeExactCandidate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) return null;
  return {
    name,
    serving: typeof raw.serving === 'string' ? raw.serving.trim() : '',
    calories: roundMacro(raw.calories ?? raw.cal),
    protein: roundMacro(raw.protein ?? raw.pro),
    carbs: roundMacro(raw.carbs ?? raw.carb),
    fat: roundMacro(raw.fat),
    provider: typeof raw.provider === 'string' ? raw.provider.trim() : 'saved-exact',
  };
}

function createExactNutritionResult(match, query, provider = 'catalog') {
  const entry = sanitizeNutritionComponent(match, query);
  return {
    name: entry.name,
    serving: entry.serving,
    calories: entry.calories,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
    source: 'exact',
    entryKind: 'branded',
    provider,
    search: {
      mode: 'branded_lookup',
      confidence: 'high',
    },
    components: [entry],
  };
}

function createEstimatedNutritionResult(name, serving, components, provider = 'heuristic') {
  const sanitizedComponents = Array.isArray(components) && components.length
    ? components.map(component => sanitizeNutritionComponent(component))
    : [sanitizeNutritionComponent({ name, serving, calories: 250, protein: 15, carbs: 20, fat: 10 }, name)];
  const total = sumNutrition(sanitizedComponents);
  return {
    name: typeof name === 'string' && name.trim() ? name.trim() : 'Meal',
    serving: typeof serving === 'string' ? serving.trim() : '',
    calories: total.calories,
    protein: total.protein,
    carbs: total.carbs,
    fat: total.fat,
    source: 'estimated',
    entryKind: 'mixed',
    provider,
    search: {
      mode: 'mixed_meal_estimate',
      confidence: 'medium',
    },
    components: sanitizedComponents,
  };
}

function tokenizeMixedMeal(message) {
  return message
    .split(/\band\b|,|\+| with /i)
    .map(part => part.trim())
    .filter(Boolean);
}

function lookupCatalogEntry(query, catalog) {
  const normalized = normalizeFoodText(query);
  return catalog.find(item => item.aliases.some(alias => normalized.includes(normalizeFoodText(alias)))) || null;
}

function isLikelyMixedMeal(message) {
  const normalized = normalizeFoodText(message);
  const parts = tokenizeMixedMeal(message);
  const hasMealPhrase = MIXED_MEAL_INTRO_PHRASES.test(normalized);
  const hasConnector = MIXED_MEAL_CONNECTORS.test(normalized);
  const componentHits = MIXED_MEAL_COMPONENT_CATALOG.filter(item => item.aliases.some(alias => normalized.includes(normalizeFoodText(alias)))).length;
  const structuralMealCue = ['sandwich', 'wrap', 'bowl', 'plate', 'tortilla', 'taco', 'pizza', 'pasta'].some(term => normalized.includes(term));
  return Boolean(
    hasMealPhrase ||
    (hasConnector && componentHits >= 2) ||
    (parts.length >= 3 && componentHits >= 2) ||
    (structuralMealCue && (hasConnector || componentHits >= 2))
  );
}

function looksClearlyBranded(message) {
  const normalized = normalizeFoodText(message);
  const brandedCueCount = BRANDED_CUES.filter(cue => normalized.includes(normalizeFoodText(cue))).length;
  const packagedCueCount = PACKAGED_FORM_CUES.filter(cue => normalized.includes(normalizeFoodText(cue))).length;
  return brandedCueCount > 0 || packagedCueCount >= 2;
}

function scoreExactNameMatch(query, candidateName) {
  const normalizedQuery = normalizeFoodText(query);
  const normalizedCandidate = normalizeFoodText(candidateName);
  if (!normalizedQuery || !normalizedCandidate) return 0;
  if (normalizedQuery === normalizedCandidate) return 100;
  if (normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate)) return 80;
  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const candidateTokens = normalizedCandidate.split(' ').filter(Boolean);
  const overlappingTokens = queryTokens.filter(token => candidateTokens.includes(token));
  if (!overlappingTokens.length) return 0;
  return Math.round((overlappingTokens.length / Math.max(queryTokens.length, candidateTokens.length)) * 60);
}

function findBestExactCandidate(query, exactCandidates) {
  const candidates = Array.isArray(exactCandidates) ? exactCandidates.map(sanitizeExactCandidate).filter(Boolean) : [];
  if (!candidates.length) return null;
  const ranked = candidates
    .map(candidate => ({ candidate, score: scoreExactNameMatch(query, candidate.name) }))
    .filter(item => item.score >= 60)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.candidate || null;
}

function estimateComponentFromCatalog(part) {
  const { quantity, cleaned } = parseQuantityMultiplier(part);
  const match = lookupCatalogEntry(cleaned, MIXED_MEAL_COMPONENT_CATALOG);
  if (match) {
    return sanitizeNutritionComponent({
      name: part.trim(),
      serving: match.serving,
      calories: match.calories * quantity,
      protein: match.protein * quantity,
      carbs: match.carbs * quantity,
      fat: match.fat * quantity,
    }, part.trim());
  }

  if (cleaned.includes('sauce') || cleaned.includes('dressing')) {
    return sanitizeNutritionComponent({ name: part.trim(), serving: '2 tbsp', calories: 80 * quantity, protein: 0, carbs: 8 * quantity, fat: 5 * quantity }, part.trim());
  }

  return sanitizeNutritionComponent({ name: part.trim(), serving: '1 serving', calories: 260 * quantity, protein: 16 * quantity, carbs: 24 * quantity, fat: 10 * quantity }, part.trim());
}

async function analyzeMixedMealWithModel(message) {
  if (!OPENAI_API_KEY) return null;

  try {
    const apiRes = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_output_tokens: 400,
        instructions: MIXED_MEAL_ANALYSIS_INSTRUCTIONS,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: message,
              },
            ],
          },
        ],
      }),
    });

    const data = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) return null;

    let structured;
    try {
      structured = JSON.parse(extractResponseText(data) || '{}');
    } catch (error) {
      structured = null;
    }
    if (!structured || typeof structured !== 'object') return null;

    const components = Array.isArray(structured.components) ? structured.components.map(item => sanitizeNutritionComponent(item)) : [];
    if (!components.length) return null;

    return createEstimatedNutritionResult(
      typeof structured.name === 'string' ? structured.name : message,
      typeof structured.serving === 'string' ? structured.serving : '',
      components,
      'openai-mixed-meal'
    );
  } catch (error) {
    return null;
  }
}

function buildHeuristicMixedMeal(message) {
  const parts = tokenizeMixedMeal(message);
  const components = (parts.length ? parts : [message]).map(estimateComponentFromCatalog);
  return createEstimatedNutritionResult(message, '', components, 'heuristic-mixed-meal');
}

function createNutritionProvider(options = {}) {
  const exactCandidates = Array.isArray(options.exactCandidates) ? options.exactCandidates : [];
  return {
    async analyzeText(message) {
      const exactCandidateMatch = findBestExactCandidate(message, exactCandidates);
      if (exactCandidateMatch && !isLikelyMixedMeal(message)) {
        return createExactNutritionResult(exactCandidateMatch, message, exactCandidateMatch.provider || 'saved-exact');
      }

      const brandedMatch = lookupCatalogEntry(message, BRANDED_FOOD_CATALOG);
      const clearlyMixed = isLikelyMixedMeal(message);
      const clearlyBranded = looksClearlyBranded(message);

      if (brandedMatch && (!clearlyMixed || clearlyBranded)) {
        return createExactNutritionResult(brandedMatch, message);
      }

      if (clearlyMixed && !clearlyBranded) {
        const modelResult = await analyzeMixedMealWithModel(message);
        return modelResult || buildHeuristicMixedMeal(message);
      }

      if (exactCandidateMatch) {
        return createExactNutritionResult(exactCandidateMatch, message, exactCandidateMatch.provider || 'saved-exact');
      }

      if (brandedMatch) {
        return createExactNutritionResult(brandedMatch, message);
      }

      const singleComponent = estimateComponentFromCatalog(message);
      return createEstimatedNutritionResult(message, singleComponent.serving, [singleComponent], 'heuristic-single-item');
    },
  };
}

async function handleNutritionAnalyze(req, res) {
  let parsed;
  try {
    const rawBody = await readBody(req);
    parsed = rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
    sendJson(res, 400, {
      error: 'Invalid JSON request body.',
    });
    return;
  }

  const message = typeof parsed.message === 'string' ? parsed.message.trim() : '';
  const exactCandidates = Array.isArray(parsed.exactCandidates) ? parsed.exactCandidates : [];
  if (!message) {
    sendJson(res, 400, {
      error: 'Message is required.',
    });
    return;
  }

  try {
    const nutritionProvider = createNutritionProvider({ exactCandidates });
    const result = await nutritionProvider.analyzeText(message);
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 502, {
      error: 'Unable to analyze nutrition right now.',
    });
  }
}

function getClientConfig() {
  return {
    apiBase: API_BASE_URL,
    appUrl: PUBLIC_APP_URL,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const hasValidSession = validateSessionCookie(req);
  const credentials = parseBasicAuthHeader(req.headers.authorization);
  const hasValidBasicAuth = Boolean(
    LIFTLYFE_PASSWORD &&
    credentials &&
    safeCompareStrings(credentials.password, LIFTLYFE_PASSWORD)
  );

  if (req.method === 'POST' && url.pathname === '/auth/login') {
    await handleAuthLogin(req, res);
    return;
  }

  if (isProtectedRoute(req.method, url.pathname) && !isAuthorizedRequest(req)) {
    if (needsLoginPage(req, url.pathname) && LIFTLYFE_SESSION_SECRET) {
      sendHtml(res, 401, renderLoginPage());
      return;
    }
    sendUnauthorized(res);
    return;
  }

  if (isProtectedRoute(req.method, url.pathname) && !hasValidSession && hasValidBasicAuth) {
    attachSessionCookie(res, req);
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    try {
      const html = fs.readFileSync(INDEX_PATH, 'utf8');
      sendHtml(res, 200, html);
    } catch (error) {
      sendHtml(res, 500, '<h1>Unable to load LiftLyfe.</h1>');
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/app-config.js') {
    const source = `window.LIFTLYFE_CONFIG=${JSON.stringify(getClientConfig())};`;
    sendJs(res, 200, source);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/healthz') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/gains') {
    await handleGains(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/nutrition/analyze') {
    await handleNutritionAnalyze(req, res);
    return;
  }

  sendJson(res, 404, { error: 'Not found.' });
});

server.listen(PORT, HOST, () => {
  const localUrl = `http://localhost:${PORT}`;
  const advertisedUrl = PUBLIC_APP_URL || localUrl;
  console.log(`LiftLyfe running. Local: ${localUrl}`);
  console.log(`LiftLyfe app URL: ${advertisedUrl}`);
});
