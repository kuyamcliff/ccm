import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "~/lib/api";
import type { VerifyResult } from "~/lib/api";
import { dayLabel, phoneLabel, timeLabel } from "~/lib/format";
import { Button } from "~/ui/Button";
import { Money } from "~/ui/Bits";
import { Icon } from "~/ui/Icon";
import { Notice } from "~/ui/Feedback";
import { useToast } from "~/state/toast";
import { DeskPage } from "./parts";

/**
 * The door.
 *
 * Someone is standing in front of you holding a phone, so this screen is one
 * question with one answer: let them in, or do not. The verdict fills the
 * screen in a colour readable at arm's length, and every outcome that is not
 * "valid" says what to do about it rather than just refusing.
 *
 * The camera is only opened when asked for, and is shut down on the way out —
 * leaving it running would sit on the device's camera and its battery.
 */

const SCAN_INTERVAL_MS = 220;

/** Every possible verdict, with the line the door person reads. */
const VERDICTS: Record<VerifyResult["outcome"], { tone: "good" | "bad" | "warn"; title: string }> = {
  valid: { tone: "good", title: "Let them in" },
  unpaid: { tone: "warn", title: "Not paid" },
  not_yet: { tone: "warn", title: "Too early" },
  not_ready: { tone: "warn", title: "Not ready yet" },
  expired: { tone: "bad", title: "Expired" },
  already_used: { tone: "warn", title: "Already used" },
  cancelled: { tone: "bad", title: "Cancelled" },
  not_found: { tone: "bad", title: "No such code" },
  forged: { tone: "bad", title: "Not one of ours" },
  unreadable: { tone: "bad", title: "Could not read that" },
};

export function Door() {
  const toast = useToast();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  /** The decoder, once it has been fetched. Held so the scan loop can use it. */
  const decoder = useRef<typeof import("jsqr").default | null>(null);
  /** The last code decoded, so one pass held to the lens is checked once. */
  const lastSeen = useRef<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [cameraProblem, setCameraProblem] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setScanning(false);
  }, []);

  useEffect(() => stop, [stop]);

  const check = useCallback(
    async (input: { token?: string; code?: string }) => {
      setBusy(true);
      try {
        const verdict = await api.desk.door.check(input);
        setResult(verdict);
        if (verdict.outcome === "valid") stop();
      } catch (err) {
        toast.failed(err);
      } finally {
        setBusy(false);
      }
    },
    [stop, toast]
  );

  async function start() {
    setCameraProblem(null);
    setResult(null);
    lastSeen.current = null;

    /* getUserMedia only exists in a secure context. Served over plain http it
       is simply absent, and without saying so the camera button looks broken
       for a reason nobody could guess. */
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraProblem(
        "This browser will not hand a web page the camera. That usually means the site was opened over http rather than https. Type the code instead."
      );
      return;
    }

    try {
      /* The QR decoder is a fifth of the console's weight and only this screen
         has any use for it, so it is fetched when the camera is opened rather
         than by everyone who signs in to the desk. */
      const { default: jsQR } = await import("jsqr");
      decoder.current = jsQR;

      stream.current = await navigator.mediaDevices.getUserMedia({
        // The back camera is the one pointing at the guest's phone.
        video: { facingMode: "environment" },
        audio: false,
      });

      // Everything that needs the <video> happens in the effect below, once
      // this has actually put it on the screen.
      setScanning(true);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setCameraProblem(
        name === "NotAllowedError"
          ? "The camera was blocked. Allow it for this site in your browser settings, then try again."
          : name === "NotFoundError"
            ? "No camera was found on this device. Type the code instead."
            : "The camera could not be opened. Type the code instead."
      );
    }
  }

  /*
   * Attach the stream and run the scan loop.
   *
   * This cannot happen inside `start`: the <video> is only rendered while
   * `scanning` is true, so at the moment the stream arrives the element does
   * not exist yet and the ref is still null. Doing it here means the element is
   * on the page by the time we reach for it.
   */
  useEffect(() => {
    if (!scanning) return;

    const element = video.current;
    const surface = canvas.current;
    const media = stream.current;
    const decode = decoder.current;
    if (!element || !surface || !media || !decode) return;

    element.srcObject = media;
    void element.play().catch(() => {
      setCameraProblem("The camera opened but the preview would not start. Type the code instead.");
    });

    const id = setInterval(() => {
      // A frame before the first one has decoded has no pixels to read.
      if (element.readyState !== element.HAVE_ENOUGH_DATA) return;

      surface.width = element.videoWidth;
      surface.height = element.videoHeight;
      const context = surface.getContext("2d", { willReadFrequently: true });
      if (!context) return;

      context.drawImage(element, 0, 0, surface.width, surface.height);
      const frame = context.getImageData(0, 0, surface.width, surface.height);

      /* Receipts print black on white, but a phone screen at an angle can
         invert what the camera sees, so both polarities are tried. */
      const found = decode(frame.data, frame.width, frame.height, { inversionAttempts: "attemptBoth" });
      if (!found?.data) return;

      /* The camera keeps seeing the same code four times a second. Without
         this, a pass that comes back anything other than valid — unpaid, too
         early — would be posted again every frame for as long as it is held
         up, which is a request storm the server would start rate-limiting. */
      if (found.data === lastSeen.current) return;
      lastSeen.current = found.data;
      void check({ token: found.data });
    }, SCAN_INTERVAL_MS);

    timer.current = id;
    return () => clearInterval(id);
  }, [scanning, check]);

  const verdict = result ? VERDICTS[result.outcome] : null;

  return (
    <DeskPage title="Door" lead="Scan the pass on the guest's phone, or type the code from it.">
      <div className="door">
        <div className="door__scanner">
          {scanning ? (
            <>
              <video ref={video} className="door__video" playsInline muted />
              <canvas ref={canvas} className="sr-only" />
              <div className="door__reticle" aria-hidden="true" />
              <Button className="door__stop" tone="ghost" onClick={stop}>
                Stop the camera
              </Button>
            </>
          ) : (
            <div className="door__idle">
              <Icon name="scan" size={40} />
              <Button tone="primary" size="lg" icon="camera" onClick={start}>
                Open the camera
              </Button>
              {cameraProblem ? <Notice tone="warn">{cameraProblem}</Notice> : null}
            </div>
          )}
        </div>

        <div className="stack">
          <form
            className="card stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (code.trim()) void check({ code: code.trim().toUpperCase() });
            }}
          >
            <label className="field">
              <span className="field__label">Type a code</span>
              <input
                className="input mono"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="CCM-XXXX"
                autoCapitalize="characters"
                autoComplete="off"
              />
            </label>
            <Button type="submit" busy={busy} disabled={!code.trim()}>
              Check it
            </Button>
          </form>

          {result && verdict ? (
            <div className={`verdict verdict--${verdict.tone}`} role="status" aria-live="assertive">
              <p className="verdict__title display display--lg">{verdict.title}</p>
              <p>{result.message}</p>

              {result.booking ? (
                <dl className="verdict__facts">
                  <div>
                    <dt className="label">Guest</dt>
                    <dd>{result.booking.guest_name}</dd>
                  </div>
                  <div>
                    <dt className="label">When</dt>
                    <dd>
                      {dayLabel(result.booking.date)} {timeLabel(result.booking.time)}
                    </dd>
                  </div>
                  <div>
                    <dt className="label">People</dt>
                    <dd>{result.booking.party_size}</dd>
                  </div>
                  <div>
                    <dt className="label">Table</dt>
                    <dd>{result.booking.table_label ?? "Any"}</dd>
                  </div>
                  <div>
                    <dt className="label">Phone</dt>
                    <dd>{phoneLabel(result.booking.phone)}</dd>
                  </div>
                </dl>
              ) : null}

              {result.order ? (
                <>
                  <ul className="lines">
                    {result.order.items.map((line, index) => (
                      <li key={index}>
                        <span className="mono lines__qty">{line.qty}</span>
                        <span>{line.name}</span>
                        <Money value={line.price * line.qty} className="push" />
                      </li>
                    ))}
                  </ul>
                  <p className="row row--between">
                    <span>{result.order.customer_name}</span>
                    <strong>
                      <Money value={result.order.total_fcfa} />
                    </strong>
                  </p>
                </>
              ) : null}

              <div className="row row--wrap">
                {result.outcome === "valid" && result.booking && !result.booking.checked_in_at ? (
                  <Button
                    tone="primary"
                    busy={busy}
                    onClick={async () => {
                      const id = result.booking!.id;
                      try {
                        const updated = await api.desk.door.admit(id);
                        setResult({ ...result, booking: updated });
                        toast.done("Checked in.");
                      } catch (err) {
                        toast.failed(err);
                      }
                    }}
                  >
                    Check them in
                  </Button>
                ) : null}

                {result.booking?.checked_in_at ? (
                  <Button
                    tone="ghost"
                    icon="undo"
                    onClick={async () => {
                      try {
                        await api.desk.door.undoAdmit(result.booking!.id);
                        toast.done("Check in undone.");
                        void check({ code: result.booking!.code });
                      } catch (err) {
                        toast.failed(err);
                      }
                    }}
                  >
                    Undo check in
                  </Button>
                ) : null}

                {result.outcome === "valid" && result.order && !result.order.collected_at ? (
                  <Button
                    tone="primary"
                    busy={busy}
                    onClick={async () => {
                      try {
                        const updated = await api.desk.door.handOver(result.order!.id);
                        setResult({ ...result, order: updated });
                        toast.done("Handed over.");
                      } catch (err) {
                        toast.failed(err);
                      }
                    }}
                  >
                    Hand it over
                  </Button>
                ) : null}

                {result.order?.collected_at ? (
                  <Button
                    tone="ghost"
                    icon="undo"
                    onClick={async () => {
                      try {
                        await api.desk.door.undoHandOver(result.order!.id);
                        toast.done("Hand over undone.");
                        void check({ code: result.order!.code });
                      } catch (err) {
                        toast.failed(err);
                      }
                    }}
                  >
                    Undo
                  </Button>
                ) : null}

                <Button
                  tone="quiet"
                  onClick={() => {
                    setResult(null);
                    setCode("");
                    // Clearing this lets the same pass be scanned again, which
                    // is what happens when a guest pays and comes back.
                    lastSeen.current = null;
                  }}
                >
                  Next guest
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </DeskPage>
  );
}
