# MTN SMS setup

Everything below goes into `backend/.env`. Never paste these values into chat,
a ticket, or a commit — `.env` is already gitignored.

This is a **different MTN portal** from the one `MOMO-SETUP.md` covers.
Collections lives at momodeveloper.mtn.com; SMS lives at **developers.mtn.com**,
a general API marketplace. Different account, different credentials, same
OAuth2 pattern.

## What you need

| `.env` key | What it is | Where it comes from |
|---|---|---|
| `MTN_SMS_CLIENT_ID` | Consumer key | developers.mtn.com, after registering an App |
| `MTN_SMS_CLIENT_SECRET` | Consumer secret | Same App |
| `MTN_SMS_SERVICE_CODE` | The approved short code messages go out under | Assigned when MTN approves the product for this account |
| `MTN_SMS_SENDER_ADDRESS` | Optional alphanumeric sender name instead of the short code | Same approval, if granted |
| `SMS_CALLBACK_SECRET` | A secret this server invents | Generate it yourself, see below |

## 1. Register

1. Sign in at <https://developers.mtn.com> and confirm your email.
2. Open **Products → Messaging → SMS v3 API**. It is the version that lists
   Cameroon among the supported countries; the older "SMS" and "SMS V2"
   products on the same portal are for other markets.
3. Create an **App** against it. The portal gives you a consumer key and
   consumer secret for the app — those are `MTN_SMS_CLIENT_ID` and
   `MTN_SMS_CLIENT_SECRET`.
4. MTN assigns the short code (`MTN_SMS_SERVICE_CODE`) once the app is
   approved for sending. Until it is approved, `notify()` keeps writing
   messages to the `notifications` table as `'logged'` rather than sending —
   nothing breaks by leaving this half-configured while you wait.

## 2. The callback URL

Generate a secret and put it in `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

That is `SMS_CALLBACK_SECRET`. With it set, this server's delivery report URL
is:

```
https://<your-backend-domain>/api/sms/delivery/<SMS_CALLBACK_SECRET>
```

On the current deployment that is:

```
https://ccm-53uc.onrender.com/api/sms/delivery/<SMS_CALLBACK_SECRET>
```

(Swap the host for wherever the backend actually runs — the Render service
name if you renamed it, or your own domain if you put one in front of it. It
is whatever `FRONTEND_URL`'s API calls resolve to, not something MTN gives
you.)

Register it by calling the subscription endpoint once, with your access token
from step 3 below:

```bash
curl -X POST https://api.mtn.com/v3/sms/messages/sms/subscription \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
        "serviceCode": "<MTN_SMS_SERVICE_CODE>",
        "callbackUrl": "https://ccm-53uc.onrender.com/api/sms/delivery/<SMS_CALLBACK_SECRET>",
        "deliveryReportUrl": "https://ccm-53uc.onrender.com/api/sms/delivery/<SMS_CALLBACK_SECRET>",
        "targetSystem": "<ask MTN what this account's value is>"
      }'
```

Two things worth knowing before you run that:

- `callbackUrl` is for replies a customer texts back to the short code.
  Nothing on this site reads them yet, so it points at the same route as
  `deliveryReportUrl` — the route only acts on a payload carrying a
  `clientCorrelatorId` it recognises, so anything else it receives is
  harmlessly ignored. MTN's schema requires the field either way.
- `targetSystem` is not documented publicly. MTN fills it in when they set up
  an account for a product; ask your MTN contact or portal support for the
  value that applies to this subscription rather than guessing at one.

The route itself, `backend/src/routes/sms.ts`, checks the secret in the path
and, when it matches, updates the matching `notifications` row from `sent` to
`failed` if MTN reports anything other than `DELIVERED` or `ENROUTE`. A wrong
or missing secret is answered with a plain 404 and changes nothing — a
delivery report arriving late or not at all is recoverable, so refusing it is
the safe direction to fail in.

## 3. Get an access token (to test, or to run the curl above)

```bash
curl -X POST "https://api.mtn.com/v1/oauth/access_token?grant_type=client_credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=<MTN_SMS_CLIENT_ID>&client_secret=<MTN_SMS_CLIENT_SECRET>"
```

Returns `{ "access_token": "...", "expires_in": ... }`. `backend/src/lib/mtnSms.ts`
does this itself and caches the token, so nothing above is needed for the app
to run — it is here for testing the subscription call by hand.

## Sandbox vs production

Unlike MoMo Collections, this portal does not appear to expose a separate
`sandbox.` host — `api.mtn.com` is the one host in the SMS v3 API's own
specification. Whether a freshly registered App is limited to test traffic
until MTN approves it for real sending is something the portal will tell you
once you have registered one; it was not visible from outside an account. If
the portal does show you a distinct sandbox host or a "trial" mode, use that
while testing and switch `MTN_SMS_BASE_URL` only if the host itself differs
— the default already points at `https://api.mtn.com`.

## How a message goes out

1. Something worth telling a guest happens — a booking confirms, a deposit is
   taken, a table comes free.
2. `notify()` in `backend/src/lib/notify.ts` composes the text, gets a bearer
   token from MTN (cached for about an hour), and calls
   `POST https://api.mtn.com/v3/sms/messages/sms/outbound`.
3. Every attempt is recorded in the `notifications` table regardless of
   outcome — `'logged'` while unconfigured, `'sent'` once MTN accepts it,
   `'failed'` if MTN refuses it or a delivery report later says it did not
   arrive.
