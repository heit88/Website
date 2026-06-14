// MOTOVICTUS checkout backend (Cloudflare Worker)
// ---------------------------------------------------------------------------
// Creates Stripe embedded Checkout Sessions (ui_mode=elements) and recalculates
// shipping based on the country the customer selects inside Checkout.
//
// The Stripe SECRET key is read from env.STRIPE_SECRET_KEY (set with
// `wrangler secret put STRIPE_SECRET_KEY`). It is NEVER committed to the repo.
// ---------------------------------------------------------------------------

// === Config — edit these ====================================================

// Origins allowed to call this Worker (CORS). Add your workers.dev URL is NOT
// needed; list the SITE origins that make the fetch calls.
const ALLOWED_ORIGINS = [
  'https://motovictus.com',
  'https://www.motovictus.com',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

// Countries we ship to (ISO-3166-1 alpha-2). UK = GB.
const SHIP_TO = ['US', 'GB', 'AU'];

// Product catalog: SKU -> { name, cents }. Prices are defined here (Stripe
// "inline price_data"), so there are NO price IDs to look up. Edit a price by
// changing `cents` (e.g. $69.95 = 6995). Keep names in sync with the site.
const PRICE_CATALOG = {
  'clutch-brembo':   { name: 'Enduro Clutch Spring — Brembo',       cents: 6995 },
  'clutch-braktec':  { name: 'Enduro Clutch Spring — Braktec',      cents: 6995 },
  'clutch-magura':   { name: 'Enduro Clutch Spring — Magura',       cents: 6995 },
  'bar-riser':       { name: '10mm Bar Riser Kit',                  cents: 2495 },
  'under-bar-mount': { name: 'Under-Bar Accessory Mount Kit',       cents: 4995 },
  'steering-stem':   { name: 'Universal 7/8" Steering Stem Mount',  cents: 2495 },
};

// Max units per checkout (also bounds the product-page quantity selector).
const MAX_QTY = 10;

// Shipping = base + (qty - 1) * extra, in CENTS. Confirm these amounts.
const SHIPPING = {
  domestic:      { base: 800,  extra: 100, label: 'Standard Shipping' },      // US
  international: { base: 3000, extra: 100, label: 'International Shipping' },  // GB, AU
};

// Stripe Tax: leave true if "Collect tax automatically" is enabled on your
// account. Flip to false if test sessions error on tax registration.
const AUTOMATIC_TAX = true;

// Tax codes (used only when AUTOMATIC_TAX is true).
const SHIPPING_TAX_CODE = 'txcd_92010001';   // Shipping
const PRODUCT_TAX_CODE = 'txcd_99999999';    // General - Tangible Goods

const STRIPE_API = 'https://api.stripe.com/v1';

// === Shipping calculation ===================================================

// region: 'domestic' (US) or 'international' (GB, AU).
function computeShipping(region, qty) {
  const tier = region === 'international' ? SHIPPING.international : SHIPPING.domestic;
  const amount = tier.base + Math.max(0, qty - 1) * tier.extra;
  return [
    {
      shipping_rate_data: {
        type: 'fixed_amount',
        display_name: tier.label,
        fixed_amount: { amount, currency: 'usd' },
        tax_behavior: 'exclusive',
        tax_code: SHIPPING_TAX_CODE,
      },
    },
  ];
}

// === Stripe REST helper (form-encoded, no SDK) ==============================

// Flatten nested objects/arrays into Stripe's bracket form-encoding, e.g.
// { line_items: [{ price: 'x' }] } -> "line_items[0][price]=x"
function encodeForm(obj, prefix, pairs = []) {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const field = prefix ? `${prefix}[${key}]` : key;
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === 'object') {
          encodeForm(item, `${field}[${i}]`, pairs);
        } else {
          pairs.push([`${field}[${i}]`, String(item)]);
        }
      });
    } else if (typeof value === 'object') {
      encodeForm(value, field, pairs);
    } else {
      pairs.push([field, String(value)]);
    }
  }
  return pairs;
}

function toBody(obj) {
  return encodeForm(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function stripe(env, method, path, params) {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set on the Worker (run: wrangler secret put STRIPE_SECRET_KEY)');
  }
  // Trim defensively: a stray newline/space pasted into `wrangler secret put`
  // produces a malformed Authorization header that Stripe rejects with an empty 400.
  const key = env.STRIPE_SECRET_KEY.trim();
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  let url = `${STRIPE_API}${path}`;
  if (params && method === 'GET') {
    url += `?${toBody(params)}`;
  } else if (params) {
    init.body = toBody(params);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    throw new Error(`Stripe ${path} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    const reqId = res.headers.get('request-id') || 'none';
    const msg =
      data && data.error
        ? data.error.message
        : `Stripe error ${res.status} (request-id: ${reqId}): ${text.slice(0, 300) || '(empty body)'}`;
    throw new Error(msg);
  }
  return data;
}

// === CORS ===================================================================

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

// === Handlers ===============================================================

async function readJson(req) {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Request body was not valid JSON');
  }
}

async function createCheckoutSession(req, env, origin) {
  const { sku, qty, region } = await readJson(req);
  const item = PRICE_CATALOG[sku];
  if (!item) {
    return json({ error: `Unknown SKU: ${sku}` }, 400, origin);
  }
  const quantity = Math.min(MAX_QTY, Math.max(1, parseInt(qty, 10) || 1));
  // Region is chosen on the product page; it locks the shipping rate and the
  // countries Stripe lets the customer pick on its hosted page.
  const isIntl = region === 'international';
  const allowedCountries = isIntl ? ['GB', 'AU'] : ['US'];

  const params = {
    mode: 'payment',
    line_items: [
      {
        quantity,
        price_data: {
          currency: 'usd',
          unit_amount: item.cents,
          tax_behavior: 'exclusive',
          product_data: { name: item.name, tax_code: PRODUCT_TAX_CODE },
        },
      },
    ],
    shipping_address_collection: { allowed_countries: allowedCountries },
    shipping_options: computeShipping(isIntl ? 'international' : 'domestic', quantity),
    automatic_tax: { enabled: AUTOMATIC_TAX },
    metadata: { sku, qty: String(quantity), region: isIntl ? 'international' : 'domestic' },
    success_url: 'https://motovictus.com/checkout-success.html?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://motovictus.com/products.html',
  };

  const session = await stripe(env, 'POST', '/checkout/sessions', params);
  return json({ url: session.url, sessionId: session.id }, 200, origin);
}

async function sessionStatus(url, env, origin) {
  const id = url.searchParams.get('session_id');
  if (!id) return json({ error: 'Missing session_id' }, 400, origin);
  const session = await stripe(env, 'GET', `/checkout/sessions/${id}`);
  return json(
    {
      status: session.status,
      payment_status: session.payment_status,
      customer_email: session.customer_details ? session.customer_details.email : null,
    },
    200,
    origin
  );
}

// === Router =================================================================

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      if (req.method === 'POST' && url.pathname === '/create-checkout-session') {
        return await createCheckoutSession(req, env, origin);
      }
      if (req.method === 'GET' && url.pathname === '/session-status') {
        return await sessionStatus(url, env, origin);
      }
      return json({ error: 'Not found' }, 404, origin);
    } catch (err) {
      return json({ error: err.message || 'Server error' }, 500, origin);
    }
  },
};
