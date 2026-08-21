import { useEffect, useState } from "react";
import { api } from "~/lib/api";
import type { GalleryPhoto } from "~/lib/api";
import { useMutation, useQuery } from "~/lib/store";
import { K } from "~/lib/keys";
import { readImageFile } from "~/lib/imageFile";
import { Img } from "~/ui/Img";
import { Action, Button, IconButton, LinkButton } from "~/ui/Button";
import { TextField } from "~/ui/Field";
import { Sheet } from "~/ui/Sheet";
import { EmptyState, ErrorState, Skeleton } from "~/ui/Feedback";
import { transitionName } from "~/ui/motion";
import { usePress } from "~/ui/press";
import { useSession } from "~/state/session";
import { useToast } from "~/state/toast";
import { useCopy } from "~/state/locale";

/**
 * The photographs.
 *
 * A masonry-ish grid of squares that fills the width of the screen with no
 * gutters on the outside, because a photograph looks better edge to edge than
 * framed in a card. Tapping one opens it full size, and the tapped square morphs
 * into the full image through a named view transition rather than the page
 * cross-fading over it.
 *
 * Guests can send a photo in. It goes to Desk > Photos for approval rather than
 * straight onto the site, which is the only sane default for anything a stranger
 * can upload to a restaurant's front page.
 */
export function GalleryPage() {
  const { c } = useCopy();
  const { user } = useSession();
  const toast = useToast();

  const { data, loading, error, reload } = useQuery(K.gallery, () => api.site.gallery(), { persist: true });
  const [open, setOpen] = useState<GalleryPhoto | null>(null);
  const [sending, setSending] = useState(false);

  const photos = (data ?? []).filter((photo) => photo.is_approved === 1);

  return (
    <div className="section stack gallery">
      <header className="page stack stack--tight">
        <h1 className="display display--xl">{c.gallery.title}</h1>
        <p className="lead">{c.gallery.lead}</p>
      </header>

      {error ? (
        <div className="page">
          <ErrorState error={error} intent="load" onRetry={reload} />
        </div>
      ) : loading ? (
        <div className="gallery__grid">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <Skeleton key={n} height="0" className="gallery__shim" radius="0" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="page">
          <EmptyState icon="camera" title={c.gallery.none} body={c.gallery.sendBody} />
        </div>
      ) : (
        <div className="gallery__grid">
          {photos.map((photo) => (
            <GalleryTile key={photo.id} photo={photo} onOpen={() => setOpen(photo)} />
          ))}
        </div>
      )}

      <div className="page bar bar--wrap">
        {user ? (
          <Button tone="ghost" size="sm" icon="camera" onClick={() => setSending(true)}>
            {c.gallery.send}
          </Button>
        ) : (
          <LinkButton to="/signin" tone="ghost" size="sm" icon="camera">
            {c.gallery.send}
          </LinkButton>
        )}
      </div>

      <Lightbox photo={open} onClose={() => setOpen(null)} />
      <SendPhoto
        open={sending}
        onClose={() => setSending(false)}
        onSent={() => {
          setSending(false);
          toast.done(c.gallery.sent);
        }}
      />
    </div>
  );
}

function GalleryTile({ photo, onOpen }: { photo: GalleryPhoto; onOpen: () => void }) {
  const press = usePress();
  return (
    <button
      type="button"
      className="gallery__tile"
      onClick={onOpen}
      aria-label={photo.caption || "Open photo"}
      {...press.pressProps}
    >
      <Img
        src={photo.image_url}
        alt={photo.caption || ""}
        ratio={1}
        radius="0"
        style={transitionName("photo", photo.id)}
      />
    </button>
  );
}

/**
 * One photograph, full size.
 *
 * Not a Sheet: a sheet is for controls and this is for looking at a picture, so
 * it takes the whole screen with one close button over it. Escape and the back
 * gesture both close it.
 */
function Lightbox({ photo, onClose }: { photo: GalleryPhoto | null; onClose: () => void }) {
  useEffect(() => {
    if (!photo) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [photo, onClose]);

  if (!photo) return null;

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={photo.caption || "Photo"}>
      <div className="lightbox__scrim" onClick={onClose} aria-hidden="true" />
      <IconButton name="close" label="Close" onClick={onClose} className="lightbox__close" />
      <figure className="lightbox__figure">
        <Img
          src={photo.image_url}
          alt={photo.caption || ""}
          ratio={1}
          radius="var(--r-md)"
          priority
          className="lightbox__img"
          style={transitionName("photo", photo.id)}
        />
        {photo.caption ? <figcaption className="fine muted center">{photo.caption}</figcaption> : null}
      </figure>
    </div>
  );
}

/* ── Sending one in ─────────────────────────────────────────────────────────*/

function SendPhoto({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void }) {
  const { c } = useCopy();
  const toast = useToast();

  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const send = useMutation(async () => {
    if (!dataUrl) return;
    await api.site.submitPhoto(dataUrl, caption.trim());
    setDataUrl(null);
    setCaption("");
    onSent();
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={c.gallery.send}
      footer={
        <Action
          tone="primary"
          block
          pending={send.pending}
          pendingLabel={c.pending.uploading}
          disabled={!dataUrl}
          onClick={async () => {
            await send.run();
            const error = send.readError();
            if (error) toast.failed(error, "upload");
          }}
        >
          {c.gallery.send}
        </Action>
      }
    >
      <div className="stack">
        <p className="lead">{c.gallery.sendBody}</p>

        <label className="dropzone">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setProblem(null);
              try {
                setDataUrl(await readImageFile(file));
              } catch (error) {
                setProblem(error instanceof Error ? error.message : "We could not read that file.");
              }
            }}
          />
          {dataUrl ? (
            <Img src={dataUrl} alt="" ratio={4 / 3} />
          ) : (
            <span className="dropzone__prompt fine muted">Choose a photo, under 6 MB</span>
          )}
        </label>

        {problem ? <p className="fine hot">{problem}</p> : null}

        <TextField
          label="Caption"
          hint="Optional. A few words about what this is."
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          maxLength={120}
        />
      </div>
    </Sheet>
  );
}
