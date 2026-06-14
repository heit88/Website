# MOTOVICTUS checkout Worker

A small Cloudflare Worker that creates Stripe **hosted** Checkout Sessions and
returns the redirect URL. The shopper picks a region (US / International) on the
product page; the Worker locks the correct shipping rate and ship-to countries,
then Stripe's hosted page handles the rest. The main site stays on GitHub Pages;
this is a separate checkout API the front-end (`checkout.html`) calls.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/create-checkout-session` | Body `{ sku, qty, region }` → `{ url, sessionId }` (redirect to `url`) |
| GET | `/session-status?session_id=…` | `{ status, payment_status, customer_email }` for the success page |

`region` is `domestic` (US) or `international` (GB, AU). Shipping =
`base + (qty − 1) × extra` per region; amounts are in `src/index.js` → `SHIPPING`
(cents).

## One-time setup

1. Install Node 18+, then the Cloudflare CLI:
   ```
   npm install -g wrangler
   wrangler login
   ```
2. Add your Stripe **secret** key (encrypted — never committed). Use the TEST key first:
   ```
   cd worker
   wrangler secret put STRIPE_SECRET_KEY
   # paste sk_test_...   (later: sk_live_...)
   ```
3. Fill in `PRICE_CATALOG` in `src/index.js` with your **test-mode** Price IDs
   (test mode is a separate data space from live — live IDs won't work in test).
4. Confirm the `SHIPPING` amounts and `AUTOMATIC_TAX` flag in `src/index.js`.

## Deploy

```
cd worker
wrangler deploy
```

Copy the printed `https://motovictus-checkout.<your-subdomain>.workers.dev` URL
and paste it into `WORKER_URL` at the top of `../checkout.html`.

## Local testing

```
cd worker
wrangler dev        # serves the Worker at http://localhost:8787
```

Temporarily point `WORKER_URL` in `checkout.html` at `http://localhost:8787`, and
serve the site from the repo root with `python -m http.server 8000` so the origin
matches `ALLOWED_ORIGINS`. Pay with test card `4242 4242 4242 4242`.

## Go-live

1. `wrangler secret put STRIPE_SECRET_KEY` → paste `sk_live_...`.
2. Swap `PRICE_CATALOG` to live Price IDs; set `WORKER_URL` + the publishable key
   in `checkout.html` to live values.
3. `wrangler deploy`.

> **Note:** This integration disables Apple Pay / Google Pay (a Stripe constraint
> of server-side shipping updates). Cards and other standard methods work.
