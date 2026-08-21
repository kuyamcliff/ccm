import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { api } from "~/lib/api";
import type { VerifyResult } from "~/lib/api";
import { useMutation } from "~/lib/store";
import { money, phoneLabel, timeLabel, dayLabel } from "~/lib/format";
import { Action, Button } from "~/ui/Button";
import { TextField } from "~/ui/Field";
import { Icon, type IconName } from "~/ui/Icon";
import { Code } from "~/ui/Bits";
import { DeskPage } from "./parts";
import { useToast } from "~/state/toast";

/**
 * The door.
 *
 * Somebody holds up a phone, this reads the code, and the screen answers one
 * question in one colour from arm's length: **let them in, or do not.**
 *
 * ── Why the verdict is enormous ────────────────────────────────────────────
 *
 * This is the only screen in the product read at a distance, at night, by
 * somebody who is also holding a torch and a clipboard. Everything else on the
 * console is dense on purpose; this is the opposite on purpose. The word and the
 * colour carry the answer, and the detail underneath is for the cases where the
 * answer is complicated.
 *
 * ── Ten outcomes, not two ──────────────────────────────────────────────────
 *
 * The server never returns an error for a bad code: it returns 200 with one of
 * ten outcomes, because "expired" and "already used" and "forged" are different
 * conversations to have with the person at the door. All ten are handled.
 *
 * The scanner runs entirely on the device. Nothing about the camera leaves it,
 * and the frames are decoded with jsQR against a canvas rather than sent
 * anywhere.
 */

const VERDICT: Record<
  VerifyResult["outcome"],
  { tone: "good" | "warn" | "bad"; word: string; icon: IconName }
> = {
  valid: { tone: "good", word: "Let them in", icon: "check-circle" },
  unpaid: { tone: "warn", word: "Not paid", icon: "wallet" },
  not_yet: { tone: "warn", word: "Too early", icon: "clock" },
  not_ready: { tone: "warn", word: "Not ready yet", icon: "clock" },
  expired: { tone: "bad", word: "Expired", icon: "clock" },
  already_used: { tone: "warn", word: "Already used", icon: "alert" },
  cancelled: { tone: "bad", word: "Cancelled", icon: "ban" },
  not_found: { tone: "bad", word: "No such code", icon: "search" },
  forged: { tone: "bad", word: "Not genuine", icon: "shield" },
  unreadable: { tone: "bad", word: "Could not read it", icon: "alert" },
};

export function Door() {
  const toast = useToast();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [typed, setTyped] = useState("");
  const [scanning, setScanning] = useState(false);

  const check = useMutation(async (input: { token?: string; code?: string }) => {
    const outcome = await api.desk.door.check(input);
    setResult(outcome);
    setScanning(false);
    /* A short buzz on a good code, a longer one on a bad. Staff learn it within
       a shift and stop needing to look at the screen for the common case. */
    if (typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(outcome.outcome === "valid" ? 30 : [60, 60, 60]);
      } catch {
        /* Switched off at the OS level. */
      }
    }
  });

  const admit = useMutation(async (id: number) => {
    const booking = await api.desk.door.admit(id);
    setResult((current) => (current ? { ...current, booking } : current));
    toast.done("In.");
  });

  const undoAdmit = useMutation(async (id: number) => {
    await api.desk.door.undoAdmit(id);
    setResult(null);
    toast.done("Undone.");
  });

  const handOver = useMutation(async (id: number) => {
    const order = await api.desk.door.handOver(id);
    setResult((current) => (current ? { ...current, order } : current));
    toast.done("Handed over.");
  });

  const undoHandOver = useMutation(async (id: number) => {
    await api.desk.door.undoHandOver(id);
    setResult(null);
    toast.done("Undone.");
  });

  const verdict = result ? VERDICT[result.outcome] : null;

  return (
    <DeskPage title="Door" hint="Scan the code on a guest's phone, or type it.">
      {scanning ? (
        <Scanner
          onCode={(token) => void check.run({ token })}
          onGiveUp={() => setScanning(false)}
          onTrouble={(message) => {
            setScanning(false);
            toast.say(message);
          }}
        />
      ) : (
        <div className="stack">
          <Button tone="primary" size="lg" block icon="scan" onClick={() => setScanning(true)}>
            Scan a code
          </Button>

          <form
            className="dk-door__manual"
            onSubmit={async (event) => {
              event.preventDefault();
              await check.run({ code: typed.trim().toUpperCase() });
              setTyped("");
            }}
          >
            <TextField
              label="Or type the code"
              value={typed}
              onChange={(event) => setTyped(event.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="CCM-1234"
            />
            <Action
              type="submit"
              tone="default"
              pending={check.pending}
              pendingLabel="Checking"
              disabled={typed.trim().length < 3}
            >
              Check
            </Action>
          </form>
        </div>
      )}

      {result && verdict ? (
        <section className="dk-verdict" data-tone={verdict.tone}>
          <Icon name={verdict.icon} size={34} />
          <p className="dk-verdict__word">{verdict.word}</p>
          <p className="lead center">{result.message}</p>

          {result.booking ? (
            <div className="rows dk-verdict__facts">
              <div className="row">
                <span className="grow label">Guest</span>
                <span>{result.booking.guest_name}</span>
              </div>
              <div className="row">
                <span className="grow label">When</span>
                <span>
                  {dayLabel(result.booking.date)}, {timeLabel(result.booking.time)}
                </span>
              </div>
              <div className="row">
                <span className="grow label">Covers</span>
                <span>{result.booking.party_size}</span>
              </div>
              {result.booking.table_label ? (
                <div className="row">
                  <span className="grow label">Table</span>
                  <span>{result.booking.table_label}</span>
                </div>
              ) : null}
              <div className="row">
                <span className="grow label">Phone</span>
                <span>{phoneLabel(result.booking.phone)}</span>
              </div>
              {result.booking.amount_fcfa ? (
                <div className="row">
                  <span className="grow label">Paid</span>
                  <span>{money(result.booking.amount_fcfa)} FCFA</span>
                </div>
              ) : null}
              {result.booking.note ? (
                <div className="row row--top">
                  <span className="grow label">Note</span>
                  <span className="right">{result.booking.note}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {result.order ? (
            <div className="rows dk-verdict__facts">
              <div className="row">
                <span className="grow label">Customer</span>
                <span>{result.order.customer_name}</span>
              </div>
              <div className="row">
                <span className="grow label">Code</span>
                <Code value={result.order.code} size="sm" />
              </div>
              <div className="row row--top">
                <span className="grow label">Order</span>
                <span className="right">
                  {result.order.items.map((line) => `${line.qty} ${line.name}`).join(", ")}
                </span>
              </div>
              <div className="row">
                <span className="grow label">Total</span>
                <span>{money(result.order.total_fcfa)} FCFA</span>
              </div>
            </div>
          ) : null}

          <div className="bar bar--tight bar--wrap dk-verdict__actions">
            {result.booking && result.outcome === "valid" && !result.booking.checked_in_at ? (
              <Action
                tone="primary"
                pending={admit.pending}
                pendingLabel="Saving"
                onClick={() => void admit.run(result.booking!.id)}
              >
                Check them in
              </Action>
            ) : null}

            {result.booking?.checked_in_at ? (
              <Action
                tone="quiet"
                pending={undoAdmit.pending}
                pendingLabel="Undoing"
                onClick={() => void undoAdmit.run(result.booking!.id)}
              >
                Undo check in
              </Action>
            ) : null}

            {result.order && result.outcome === "valid" && !result.order.collected_at ? (
              <Action
                tone="primary"
                pending={handOver.pending}
                pendingLabel="Saving"
                onClick={() => void handOver.run(result.order!.id)}
              >
                Hand it over
              </Action>
            ) : null}

            {result.order?.collected_at ? (
              <Action
                tone="quiet"
                pending={undoHandOver.pending}
                pendingLabel="Undoing"
                onClick={() => void undoHandOver.run(result.order!.id)}
              >
                Undo
              </Action>
            ) : null}

            <Button tone="ghost" onClick={() => setResult(null)}>
              Next guest
            </Button>
          </div>
        </section>
      ) : null}
    </DeskPage>
  );
}

/* ── The camera ─────────────────────────────────────────────────────────────*/

/**
 * Reads QR codes from the back camera, entirely on the device.
 *
 * Frames are drawn to an offscreen canvas and decoded by jsQR. Nothing about the
 * camera leaves the phone, and the stream's tracks are stopped explicitly on the
 * way out: leaving them running is what keeps the camera light on after somebody
 * has navigated away, which reads as a phone that is spying on the room.
 */
function Scanner({
  onCode,
  onGiveUp,
  onTrouble,
}: {
  onCode: (token: string) => void;
  onGiveUp: () => void;
  onTrouble: (message: string) => void;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const found = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    async function begin() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
      } catch {
        onTrouble("We could not open the camera. Type the code instead.");
        return;
      }

      const node = video.current;
      if (!node) return;
      node.srcObject = stream;
      await node.play().catch(() => {});
      setReady(true);
      tick();
    }

    function tick() {
      frame = requestAnimationFrame(tick);
      const node = video.current;
      if (!node || !context || found.current) return;
      if (node.readyState !== node.HAVE_ENOUGH_DATA) return;

      canvas.width = node.videoWidth;
      canvas.height = node.videoHeight;
      if (canvas.width === 0 || canvas.height === 0) return;

      context.drawImage(node, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "dontInvert" });
      if (!code?.data) return;

      /* One read per mount. Without this the same code fires forty times a
         second for as long as it is in shot. */
      found.current = true;
      onCode(code.data);
    }

    void begin();

    return () => {
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onCode, onTrouble]);

  return (
    <div className="dk-scan">
      <video ref={video} className="dk-scan__video" playsInline muted />
      <div className="dk-scan__frame" aria-hidden="true" />
      <p className="fine faint center">{ready ? "Point it at the code." : "Opening the camera"}</p>
      <Button tone="quiet" block onClick={onGiveUp}>
        Type it instead
      </Button>
    </div>
  );
}
