import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { useLanguage } from "../i18n/context";

interface Props {
  /** Called with the raw decoded string. Paused until the caller resumes. */
  onDecode: (text: string) => void;
  /** Set false while a result is on screen so the camera stops hunting. */
  active: boolean;
  onError?: (message: string) => void;
}

/**
 * Camera QR scanner for the door.
 *
 * Built here rather than handing staff off to a phone's generic scanner app:
 * the result has to come straight back into the verification flow, and a
 * general scanner would just show them an opaque signed token.
 *
 * Decoding is done by jsQR. `BarcodeDetector` is used when the browser has it
 * (it is hardware-accelerated) but it is absent on iOS Safari, which is what a
 * lot of staff phones run, so the library is the baseline rather than a
 * fallback nobody tests.
 */
export function QrScanner({ onDecode, active, onError }: Props) {
  const { t } = useLanguage();
  const tq = (key: string) => t("qrScanner", key);
  const tqRef = useRef(tq);
  tqRef.current = tq;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<{ detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> } | null>(null);

  const [status, setStatus] = useState<"idle" | "starting" | "running" | "denied" | "unsupported">("idle");
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  // Held in a ref so the scan loop always sees the current values without
  // being torn down and restarted on every render.
  const activeRef = useRef(active);
  const onDecodeRef = useRef(onDecode);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { onDecodeRef.current = onDecode; }, [onDecode]);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setTorchOn(false);
  }, []);

  const scanFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(() => void scanFrame());
      return;
    }

    if (activeRef.current) {
      try {
        // Native path first where available.
        if (detectorRef.current) {
          const hits = await detectorRef.current.detect(video);
          if (hits.length > 0 && hits[0].rawValue) {
            onDecodeRef.current(hits[0].rawValue);
            rafRef.current = requestAnimationFrame(() => void scanFrame());
            return;
          }
        } else {
          const canvas = (canvasRef.current ??= document.createElement("canvas"));
          // Downscale to at most 640px on the long edge: a full-resolution
          // frame costs far more per scan without decoding any better.
          const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);

          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx && canvas.width > 0) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "attemptBoth" });
            if (found?.data) onDecodeRef.current(found.data);
          }
        }
      } catch {
        // A bad frame is normal — keep going rather than dropping the camera.
      }
    }

    rafRef.current = requestAnimationFrame(() => void scanFrame());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        onError?.(tqRef.current("errUnsupported"));
        return;
      }

      setStatus("starting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // Rear camera on a phone; falls back to whatever exists on a laptop.
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          // iOS refuses to play inline without both of these set.
          video.setAttribute("playsinline", "true");
          video.muted = true;
          await video.play().catch(() => {});
        }

        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        setTorchAvailable(Boolean(caps?.torch));

        const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
        if (Detector) {
          try { detectorRef.current = new Detector({ formats: ["qr_code"] }); } catch { detectorRef.current = null; }
        }

        setStatus("running");
        rafRef.current = requestAnimationFrame(() => void scanFrame());
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setStatus("denied");
          onError?.(tqRef.current("errDenied"));
        } else if (name === "NotFoundError") {
          setStatus("unsupported");
          onError?.(tqRef.current("errNotFound"));
        } else {
          setStatus("unsupported");
          onError?.(tqRef.current("errGeneric"));
        }
      }
    }

    void start();
    return () => { cancelled = true; stop(); };
  }, [scanFrame, stop, onError]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      // `torch` is real on Android Chrome but absent from the DOM typings.
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }

  return (
    <div className="qrs">
      <div className="qrs-stage">
        <video ref={videoRef} className="qrs-video" playsInline muted aria-label={tq("viewfinderLabel")} />

        {/* Framing guide. Purely visual, the whole frame is decoded, so a
            code slightly outside the box still reads. */}
        <div className="qrs-frame" aria-hidden="true">
          <span className="qrs-corner tl" /><span className="qrs-corner tr" />
          <span className="qrs-corner bl" /><span className="qrs-corner br" />
          {status === "running" && active && <span className="qrs-sweep" />}
        </div>

        {status !== "running" && (
          <div className="qrs-overlay">
            {status === "starting" && (
              <><span className="route-fallback-dot" aria-hidden="true" /><p>{tq("openingCamera")}</p></>
            )}
            {status === "denied" && <p>{tq("cameraBlocked")}</p>}
            {status === "unsupported" && <p>{tq("noCamera")}</p>}
          </div>
        )}

        {!active && status === "running" && (
          <div className="qrs-overlay qrs-paused"><p>{tq("scannerPaused")}</p></div>
        )}
      </div>

      <div className="qrs-bar">
        <p className="qrs-hint">
          {status === "running"
            ? active ? tq("pointAtCode") : tq("clearToScan")
            : tq("waitingCamera")}
        </p>
        {torchAvailable && (
          <button type="button" className="btn btn-outline btn-sm" onClick={toggleTorch}>
            {torchOn ? tq("torchOff") : tq("torchOn")}
          </button>
        )}
      </div>
    </div>
  );
}
