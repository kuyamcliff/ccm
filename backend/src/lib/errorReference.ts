import { randomInt } from "node:crypto";

/**
 * A short code that ties what the customer saw to what the server logged.
 *
 * When something breaks, the customer is told what happened in words they can
 * act on and nothing else — no stack, no SQL, no provider payload. That is
 * right, and it leaves support with nothing to search for when the customer
 * gets in touch. This is the one piece of the failure that is safe to show
 * them: it means nothing on its own and matches exactly one line in the log.
 *
 * Deliberately short and unambiguous when read aloud over a bad phone line,
 * which is how it will usually arrive. The alphabet leaves out the characters
 * that get misheard or mistyped — I/1, O/0, S/5, Z/2 — so "CCM-7F42" cannot
 * come back as something that matches a different incident.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRTUVWXY346789";

export function newErrorReference(): string {
  let code = "";
  for (let i = 0; i < 4; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `CCM-${code}`;
}
