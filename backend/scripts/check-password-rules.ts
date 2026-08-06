/*
 * Guards the one copied file in the project.
 *
 * `frontend/src/lib/passwordStrength.ts` is a deliberate copy of the server's
 * rules, so the meter says what the server would say. The copy is only worth
 * having while it stays a copy: rules that drift produce a form that passes a
 * password the API then refuses, which is worse than no meter at all.
 *
 * Everything below the header comment must match character for character. The
 * headers differ on purpose, because the two files explain themselves to
 * different readers.
 *
 * Run: npm run check:rules
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(here, "../src/lib/passwordStrength.ts");
const CLIENT = resolve(here, "../../frontend/src/lib/passwordStrength.ts");

/** Everything from the first export onwards: the rules themselves. */
function rules(path: string): string[] {
  const lines = readFileSync(path, "utf8").split("\n");
  const start = lines.findIndex((line) => line.startsWith("export "));
  if (start === -1) throw new Error(`No exports found in ${path}. Has it been renamed?`);
  return lines.slice(start);
}

const server = rules(SERVER);
const client = rules(CLIENT);

const drift = Math.max(server.length, client.length);
let firstDifference = -1;
for (let i = 0; i < drift; i++) {
  if (server[i] !== client[i]) {
    firstDifference = i;
    break;
  }
}

if (firstDifference === -1) {
  console.log("PASS  password rules match on both sides");
  process.exit(0);
}

console.error("FAIL  the password rules have drifted apart.\n");
console.error(`  backend/src/lib/passwordStrength.ts   ${JSON.stringify(server[firstDifference] ?? "(ends here)")}`);
console.error(`  frontend/src/lib/passwordStrength.ts  ${JSON.stringify(client[firstDifference] ?? "(ends here)")}`);
console.error("\n  The server is the authority. Copy its version over the client's,");
console.error("  keeping the client's header comment.");
process.exit(1);
