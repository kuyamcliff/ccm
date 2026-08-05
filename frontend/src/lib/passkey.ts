import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { api } from "./api";
import { ApiError } from "./http";

/**
 * Passkeys, from the browser's side.
 *
 * Both ceremonies are the same shape: ask the server for a challenge, hand it
 * to the platform authenticator, send back what it produced. The value in
 * having it here rather than in the two screens that use it is the error
 * handling, which is most of the work.
 *
 * A failed WebAuthn call throws a DOMException whose message is written for a
 * browser engineer. "The operation either timed out or was not allowed" is what
 * a customer sees when they tap Cancel on the fingerprint prompt, and it is not
 * something to put in front of them. Every case that can be recognised is
 * turned into a sentence about what actually happened.
 */

/** Whether this browser can do passkeys at all. */
export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function";
}

/**
 * Whether this device has a built-in authenticator, which is what decides
 * between offering to make a passkey and staying quiet about it. A desktop
 * with no fingerprint reader can still use a phone over hybrid, so a false
 * answer here is not a reason to hide the option, only to stop leading with it.
 */
export async function platformAuthenticatorAvailable(): Promise<boolean> {
  if (!passkeysSupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export class PasskeyError extends Error {
  /** True when the person simply changed their mind, which is not a failure. */
  readonly cancelled: boolean;

  constructor(message: string, cancelled = false) {
    super(message);
    this.name = "PasskeyError";
    this.cancelled = cancelled;
  }
}

function readFailure(err: unknown, verb: string): PasskeyError {
  if (err instanceof ApiError) return new PasskeyError(err.message);

  const name = err instanceof DOMException ? err.name : "";

  /* NotAllowed covers both a cancelled prompt and one that timed out, and the
     browser will not say which. Cancelling is far and away the common case. */
  if (name === "NotAllowedError") {
    return new PasskeyError(`Passkey ${verb} was cancelled.`, true);
  }
  if (name === "InvalidStateError") {
    return new PasskeyError("This device already has a passkey for your account.");
  }
  if (name === "SecurityError") {
    return new PasskeyError("Passkeys need a secure connection to this site. Check the address and try again.");
  }
  if (name === "AbortError") {
    return new PasskeyError(`Passkey ${verb} was stopped.`, true);
  }
  if (name === "NotSupportedError") {
    return new PasskeyError("This device cannot make a passkey.");
  }
  return new PasskeyError(`Passkey ${verb} did not work. Try again, or use your password.`);
}

/** Creates a passkey on this device and saves it against the signed-in account. */
export async function addPasskey(): Promise<string> {
  if (!passkeysSupported()) {
    throw new PasskeyError("This browser does not support passkeys.");
  }

  try {
    const { options, token } = await api.me.passkeyOptions();
    const response = await startRegistration({
      optionsJSON: options as PublicKeyCredentialCreationOptionsJSON,
    });
    const saved = await api.me.passkeyVerify(token, response);
    return saved.display_name;
  } catch (err) {
    throw readFailure(err, "setup");
  }
}

/**
 * Signs in with a passkey. Nothing is passed in: the credentials are
 * discoverable, so the browser knows which keys belong to this site and asks
 * which one to use.
 */
export async function signInWithPasskey() {
  if (!passkeysSupported()) {
    throw new PasskeyError("This browser does not support passkeys.");
  }

  try {
    const { options, token } = await api.me.passkeyLoginOptions();
    const response = await startAuthentication({
      optionsJSON: options as PublicKeyCredentialRequestOptionsJSON,
    });
    return await api.me.passkeyLogin(token, response);
  } catch (err) {
    throw readFailure(err, "sign in");
  }
}
