/**
 * Provisions a sandbox API user and API key against your MoMo subscription key.
 *
 * Reads MOMO_SUBSCRIPTION_KEY from the environment (put it in backend/.env and
 * run with `node --env-file=.env`, or `npm run momo:provision` which does that
 * for you). A key can also be passed as an argument, but the env-file route is
 * preferred: it means the secret only ever lives in a file you edited
 * yourself, never on a command line or in shell history.
 *
 * Sandbox only — production credentials are issued by MTN when your live
 * account is approved.
 */

import { randomUUID } from "node:crypto";

const BASE = "https://sandbox.momodeveloper.mtn.com";

const subscriptionKey = (process.env.MOMO_SUBSCRIPTION_KEY ?? process.argv[2])?.trim();
if (!subscriptionKey) {
  console.error("Set MOMO_SUBSCRIPTION_KEY in backend/.env, then run: npm run momo:provision");
  console.error("Find the key on momodeveloper.mtn.com → Profile → Collection → Primary Key.");
  process.exit(1);
}

// The callback host is required by the API but unused here: we poll for status
// rather than having MTN call us, so any owned domain satisfies it.
const callbackHost = process.argv[3]?.trim() || "example.com";

async function main() {
  const userId = randomUUID();

  const createUser = await fetch(`${BASE}/v1_0/apiuser`, {
    method: "POST",
    headers: {
      "X-Reference-Id": userId,
      "Ocp-Apim-Subscription-Key": subscriptionKey!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ providerCallbackHost: callbackHost }),
  });

  if (createUser.status !== 201) {
    const detail = await createUser.text().catch(() => "");
    console.error(`Could not create the API user (HTTP ${createUser.status}).`);
    if (createUser.status === 401) {
      console.error("That subscription key was rejected. Check you copied the Collection Primary Key.");
    }
    if (detail) console.error(detail.slice(0, 400));
    process.exit(1);
  }

  const createKey = await fetch(`${BASE}/v1_0/apiuser/${userId}/apikey`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": subscriptionKey!, "Content-Length": "0" },
  });

  if (createKey.status !== 201) {
    const detail = await createKey.text().catch(() => "");
    console.error(`Could not create the API key (HTTP ${createKey.status}).`);
    if (detail) console.error(detail.slice(0, 400));
    process.exit(1);
  }

  const { apiKey } = (await createKey.json()) as { apiKey: string };

  // The subscription key is omitted here — you already have it in .env, no
  // need to echo it back. Add these two newly generated values yourself:
  console.log("\nAdd these two lines to backend/.env:\n");
  console.log(`MOMO_API_USER=${userId}`);
  console.log(`MOMO_API_KEY=${apiKey}`);
  console.log(`\nAnd confirm these are already set:`);
  console.log(`MOMO_TARGET_ENVIRONMENT=sandbox`);
  console.log(`MOMO_BASE_URL=${BASE}\n`);
}

main().catch((err) => {
  console.error("Provisioning failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
