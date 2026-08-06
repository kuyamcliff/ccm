/**
 * What counts as an acceptable password.
 *
 * Length was the only rule before this, which let through the passwords that
 * actually get accounts taken: "password1", "camchop2024", the customer's own
 * name, the eight characters sitting under their left hand. None of those are
 * broken by cracking a bcrypt hash. They are broken by guessing, and guessing
 * is what a blocklist stops.
 *
 * The shape follows NIST 800-63B rather than the older composition rules:
 * length carries most of the weight, a known-bad list carries the rest, and
 * there is no demand for a symbol that only ever produces "Password1!".
 * A long passphrase passes untouched; a short one has to be varied.
 *
 * This is a copy of `backend/src/lib/passwordStrength.ts`, kept identical on
 * purpose. It exists so somebody sees the problem while they are typing rather
 * than after a round trip, and so the sentence they read here is the same
 * sentence the server would have sent back.
 *
 * The server is the authority. Nothing here is a check: it is a preview of one.
 * If the two ever drift, the server wins and the meter is simply wrong for a
 * moment, which is the right way round. Change one, change both.
 */

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200;

/** Below this a password has to mix character types; at or above it, length
 *  is doing enough work on its own and a plain passphrase is fine. */
const PASSPHRASE_LENGTH = 12;

/**
 * The passwords guessed first. Not a dictionary: a list this size is checked
 * in memory on every signup, and its job is to catch the handful of choices
 * that make up a startling share of real accounts, plus the ones this
 * restaurant in particular invites.
 */
const COMMON = new Set([
  "password", "passw0rd", "password1", "password12", "password123", "password1234",
  "passwords", "mypassword", "newpassword", "passcode", "motdepasse",
  "12345678", "123456789", "1234567890", "123123123", "111111111", "000000000",
  "87654321", "12341234", "11223344", "12344321", "1q2w3e4r", "1qaz2wsx", "qazwsxedc",
  "qwertyui", "qwertyuiop", "asdfghjk", "asdfghjkl", "zxcvbnm", "qwerty123", "qweasdzxc",
  "iloveyou", "iloveyou1", "letmein", "letmein1", "welcome", "welcome1", "welcome123",
  "abc12345", "abcd1234", "a1b2c3d4", "trustno1", "sunshine", "princess", "football",
  "baseball", "superman", "batman123", "pokemon1", "starwars", "monkey123", "dragon123",
  "shadow123", "master123", "michael1", "jennifer", "jordan23", "chelsea1", "liverpool",
  "arsenal1", "barcelona", "realmadrid", "manchester", "chinaman",
  "administrator", "admin123", "admin1234", "administrator1", "root1234", "toor1234",
  "changeme", "changeme1", "default1", "secret123", "temporary", "temp1234",
  "whatever", "nopassword", "anything", "asdfasdf", "qwerqwer", "zaq12wsx",
  // Guessed from the restaurant and where it stands.
  "camchop", "camchop1", "camchop123", "camchopmeat", "chopmeat", "chopmeat1",
  "cameroon", "cameroon1", "cameroun", "buea1234", "bueatown", "razelstreet",
  "restaurant", "restaurant1", "barbecue", "barbecue1", "suyasuya", "grilled1",
]);

/** Rows a password gets dragged along when somebody wants to be done with the
 *  form. Any slice of one of these, forwards or backwards, is a guess away. */
const RUNS = [
  "abcdefghijklmnopqrstuvwxyz",
  "0123456789",
  "1234567890",
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "azertyuiop",
  "qwertzuiop",
];

/** Substitutions that feel like a disguise and are the first thing a cracking
 *  rule undoes, so "p@ssw0rd" is scored as the "password" it is. */
const LEET: Record<string, string> = {
  "4": "a", "@": "a", "8": "b", "(": "c", "3": "e", "6": "g", "1": "i", "!": "i",
  "|": "i", "0": "o", "9": "q", "5": "s", "$": "s", "7": "t", "+": "t", "2": "z",
};

function deLeet(value: string): string {
  return value.replace(/[4@8(36!|095$7+2]/g, (c) => LEET[c] ?? c);
}

/** Lowercase, and with the padding people add to clear a length rule removed,
 *  so "password!!!" and "  password  " are recognised as "password". */
function core(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+$/g, "").replace(/^[^a-z0-9]+/g, "");
}

function isCommon(password: string): boolean {
  for (const candidate of new Set([
    password.toLowerCase(),
    core(password),
    deLeet(password.toLowerCase()),
    deLeet(core(password)),
    // A year on the end is the most common way of "changing" a password.
    core(password).replace(/(19|20)\d\d$/, ""),
    deLeet(core(password)).replace(/(19|20)\d\d$/, ""),
  ])) {
    if (candidate.length >= 4 && COMMON.has(candidate)) return true;
  }
  return false;
}

/** True when the whole password is one character, or one short block typed
 *  over and over: "aaaaaaaa", "abcabcabc", "12121212". */
function isRepetition(password: string): boolean {
  const lower = password.toLowerCase();
  for (let size = 1; size <= Math.floor(lower.length / 2); size++) {
    if (lower.length % size !== 0) continue;
    const block = lower.slice(0, size);
    if (block.repeat(lower.length / size) === lower) return true;
  }
  return false;
}

/** True when the whole password is a slice of a keyboard row or the alphabet,
 *  typed in either direction. */
function isRun(password: string): boolean {
  /* Both forms, because de-leeting is what catches "qw3rtyui" but is also what
     would turn "12345678" into letters and hide the plainest run of all. */
  for (const form of new Set([password.toLowerCase(), deLeet(password.toLowerCase())])) {
    const backwards = [...form].reverse().join("");
    if (RUNS.some((row) => row.includes(form) || row.includes(backwards))) return true;
  }
  return false;
}

function classCount(password: string): number {
  let count = 0;
  if (/[a-z]/.test(password)) count++;
  if (/[A-Z]/.test(password)) count++;
  if (/[0-9]/.test(password)) count++;
  if (/[^a-zA-Z0-9]/.test(password)) count++;
  return count;
}

/**
 * The words already on the account. A password built from any of them is
 * public knowledge: the email is on the booking, the name is on the receipt.
 */
function personalWords(identity: PasswordIdentity): string[] {
  const words: string[] = [];
  const push = (raw: string | undefined | null) => {
    for (const part of String(raw ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
      if (part.length >= 4) words.push(part);
    }
  };

  push(identity.name);
  push(identity.email?.split("@")[0]);
  return words;
}

export interface PasswordIdentity {
  name?: string | null;
  email?: string | null;
}

/**
 * Returns the sentence to show the person, or null when the password is fine.
 *
 * One message at a time and always the most important one. A list of five
 * complaints reads as a wall and gets solved by adding an exclamation mark to
 * the end of the same bad password.
 */
export function checkPassword(password: string, identity: PasswordIdentity = {}): string | null {
  if (password.length < MIN_PASSWORD) {
    return `Password needs at least ${MIN_PASSWORD} characters.`;
  }
  if (password.length > MAX_PASSWORD) {
    return `That password is too long. Keep it under ${MAX_PASSWORD} characters.`;
  }
  if (password.trim().length < MIN_PASSWORD) {
    return "That is mostly spaces. Use at least 8 characters you can actually type again.";
  }
  if (isCommon(password)) {
    return "That password is one of the first anybody guesses. Pick something else.";
  }
  if (isRepetition(password)) {
    return "That is the same few characters repeated. Mix it up a bit.";
  }
  if (isRun(password)) {
    return "That is a straight run across the keyboard. Pick something less obvious.";
  }

  const lower = deLeet(password.toLowerCase());
  for (const word of personalWords(identity)) {
    if (lower.includes(word)) {
      return "Leave your name and email out of your password. Anyone booking a table can see both.";
    }
  }

  if (password.length < PASSPHRASE_LENGTH && classCount(password) < 2) {
    return "Short passwords need a mix. Add a number or a capital, or make it longer instead.";
  }

  return null;
}

/**
 * A 0 to 4 score for the strength meter. Deliberately not what decides whether
 * a password is allowed: `checkPassword` does that, and a meter that blocks on
 * its own score would fail passwords the server is happy with.
 */
export function passwordScore(password: string, identity: PasswordIdentity = {}): number {
  if (!password) return 0;
  if (checkPassword(password, identity)) return password.length >= MIN_PASSWORD ? 1 : 0;

  let score = 2;
  if (password.length >= PASSPHRASE_LENGTH) score++;
  if (password.length >= 16 || (password.length >= PASSPHRASE_LENGTH && classCount(password) >= 3)) score++;
  return Math.min(score, 4);
}
