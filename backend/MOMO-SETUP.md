# MTN MoMo Collections setup

Everything below goes into `backend/.env`. Never paste these values into chat,
a ticket, or a commit — `.env` is already gitignored.

## What you need

| `.env` key | What it is | Where it comes from |
|---|---|---|
| `MOMO_SUBSCRIPTION_KEY` | **Primary Key** for the Collection product | momodeveloper.mtn.com → Profile → Subscriptions |
| `MOMO_API_USER` | API User UUID | Provisioned (see below) |
| `MOMO_API_KEY` | API Key for that user | Provisioned (see below) |
| `MOMO_TARGET_ENVIRONMENT` | `sandbox`, or the live value MTN issues you | MTN, when your production account is approved |
| `MOMO_BASE_URL` | API host | Sandbox host below; MTN gives you a country host in production |
| `MOMO_CURRENCY` | `EUR` in sandbox, `XAF` live | Leave unset in production to default to `XAF` |

## 1. Sandbox

1. Sign up at <https://momodeveloper.mtn.com> and confirm your email.
2. Open **Products → Collection → Subscribe**.
3. Go to **Profile**. Under your Collection subscription, copy the **Primary Key**.
   That is `MOMO_SUBSCRIPTION_KEY`.
4. Provision an API user and key against it:

```bash
npm run momo:provision -- <YOUR_PRIMARY_KEY>
```

That prints a `MOMO_API_USER` and `MOMO_API_KEY`. Paste all three into `.env`
and leave `MOMO_TARGET_ENVIRONMENT=sandbox`.

Sandbox settles in EUR and never charges a real handset. MTN's test numbers
drive the outcome: a number ending `46733123450` succeeds, and others return
specific failures so you can exercise the error states.

## 2. Production

Sandbox credentials do **not** work in production — you get a fresh set.

1. In the developer portal, apply to go live for **Collection**. MTN Cameroon
   runs a KYC check and asks for your business registration and the MoMo
   merchant account the money should land in.
2. Once approved, MTN gives you:
   - a production **subscription key**,
   - a production **API user + API key**,
   - the **target environment** string for Cameroon,
   - the **production base URL**.
3. Put those in `.env`, drop `MOMO_CURRENCY` so it defaults to `XAF`, and set
   `NODE_ENV=production`.

The server refuses to start in production while `MOMO_TARGET_ENVIRONMENT` is
still `sandbox`, so a half-finished switchover cannot quietly take live orders
into a test wallet.

## How a payment runs

1. Customer enters their MTN number and taps pay.
2. We call `requestToPay`. MTN pushes a PIN prompt to that handset.
3. The customer approves it. If the prompt does not appear, they dial `*126#`
   and approve the pending request from the menu.
4. We poll the transaction until MTN reports `SUCCESSFUL` or `FAILED`.
5. Anything still pending after **3 minutes** is treated as failed and any promo
   or gift-card value it was holding is released. MTN expires it on their side
   too — their guidance to integrators is to give up after 2–3 minutes.

Every attempt sends a fresh `X-Reference-Id`, which MoMo treats as an
idempotency key, so a retried request cannot charge a customer twice.
