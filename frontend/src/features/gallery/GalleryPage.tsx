import { useState } from "react";
import { api } from "~/lib/api";
import type { GalleryPhoto } from "~/lib/api";
import { IMAGE_ACCEPT, ImageError, readImageFile } from "~/lib/imageFile";
import { useAction, useResource } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { TextField } from "~/ui/Field";
import { Icon } from "~/ui/Icon";
import { Photo } from "~/ui/Photo";
import { EmptyState, ErrorState, Notice, Skeleton } from "~/ui/Feedback";
import { Sheet } from "~/ui/Sheet";
import { useToast } from "~/state/toast";

/**
 * Photos, mostly other people's.
 *
 * Anything sent in waits for the owner to approve it before it appears, so the
 * submit form says exactly that rather than implying an instant post.
 */

function Lightbox({ photo, onClose }: { photo: GalleryPhoto; onClose: () => void }) {
  return (
    <Sheet open onClose={onClose} title={photo.caption || "Photo"}>
      <img className="lightbox__img" src={photo.image_url} alt={photo.caption} />
      {photo.submitter_name ? <p className="fine faint">Sent in by {photo.submitter_name}</p> : null}
    </Sheet>
  );
}

export function GalleryPage() {
  const photos = useResource(() => api.site.gallery(), []);
  const toast = useToast();

  const [open, setOpen] = useState<GalleryPhoto | null>(null);
  const [sending, setSending] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const submit = useAction(api.site.submitPhoto);
  const rows = photos.data ?? [];

  return (
    <div className="page section">
      <div className="section-head">
        <hr className="heat-rule" />
        <h1 className="display display--xl">The gallery</h1>
        <p className="lead">Nights at the grill, sent in by people who were there.</p>
        <div className="row">
          <Button icon="camera" onClick={() => setSending(true)}>
            Send a photo
          </Button>
        </div>
      </div>

      {photos.loading ? (
        <div className="mosaic">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <Skeleton key={n} height="12rem" radius="var(--r-md)" />
          ))}
        </div>
      ) : photos.error ? (
        <ErrorState error={photos.error} onRetry={photos.reload} />
      ) : rows.length === 0 ? (
        <EmptyState icon="image" title="No photos up yet">
          Send one in and it will be here once the owner has looked at it.
        </EmptyState>
      ) : (
        <div className="mosaic">
          {rows.map((photo) => (
            <button
              key={photo.id}
              type="button"
              className={`mosaic__cell${photo.is_featured ? " mosaic__cell--big" : ""}`}
              onClick={() => setOpen(photo)}
              aria-label={photo.caption || "Open photo"}
            >
              <Photo src={photo.image_url} alt={photo.caption} />
              {photo.caption ? <span className="mosaic__caption">{photo.caption}</span> : null}
            </button>
          ))}
        </div>
      )}

      {open ? <Lightbox photo={open} onClose={() => setOpen(null)} /> : null}

      <Sheet
        open={sending}
        onClose={() => setSending(false)}
        title="Send a photo"
        description="It goes to the owner first. Nothing appears here until they say so."
        footer={
          <>
            <Button tone="ghost" onClick={() => setSending(false)}>
              Cancel
            </Button>
            <Button
              tone="primary"
              busy={submit.busy}
              disabled={!image}
              onClick={async () => {
                if (!image) return;
                const result = await submit.run(image, caption.trim());
                if (!result) {
                  setProblem("That photo could not be sent. Try a smaller one.");
                  return;
                }
                setSending(false);
                setImage(null);
                setCaption("");
                toast.done(result.message || "Sent. Thanks.");
              }}
            >
              Send it
            </Button>
          </>
        }
      >
        <label className="dropzone">
          {image ? (
            <img src={image} alt="" />
          ) : (
            <span className="dropzone__hint">
              <Icon name="upload" size={24} />
              Choose a photo, up to 6 MB
            </span>
          )}
          <input
            type="file"
            accept={IMAGE_ACCEPT}
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setProblem(null);
              try {
                setImage(await readImageFile(file));
              } catch (err) {
                setProblem(err instanceof ImageError ? err.message : "That photo could not be used.");
              }
            }}
          />
        </label>

        <TextField
          label="Caption"
          placeholder="Optional"
          value={caption}
          maxLength={200}
          onChange={(e) => setCaption(e.target.value)}
        />

        {problem ? <Notice tone="bad">{problem}</Notice> : null}
      </Sheet>
    </div>
  );
}
