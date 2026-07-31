import { useState } from "react";
import { api } from "~/lib/api";
import { stampLabel } from "~/lib/format";
import { IMAGE_ACCEPT, ImageError, readImageFile } from "~/lib/imageFile";
import { useResource } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { Badge } from "~/ui/Bits";
import { TextField } from "~/ui/Field";
import { Photo } from "~/ui/Photo";
import { Notice } from "~/ui/Feedback";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { DeskPage, Loaded, Nothing, Toolbar } from "./parts";

/**
 * Photos waiting to go up, and the ones already up.
 *
 * Anything a customer sends starts hidden, so this screen leads with what is
 * waiting rather than making somebody hunt for it. Featuring a photo makes it
 * take four cells in the public grid.
 */
export function GalleryAdmin() {
  const photos = useResource(() => api.desk.gallery.all(), []);
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();

  const [adding, setAdding] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  async function update(id: number, changes: { is_approved?: boolean; is_featured?: boolean }, said: string) {
    try {
      await api.desk.gallery.update(id, changes);
      photos.reload();
      toast.done(said);
    } catch (err) {
      toast.failed(err);
    }
  }

  const waiting = (photos.data ?? []).filter((photo) => photo.is_approved !== 1);
  const live = (photos.data ?? []).filter((photo) => photo.is_approved === 1);

  return (
    <DeskPage
      title="Photos"
      actions={
        <Button tone="primary" icon="upload" onClick={() => setAdding(true)}>
          Add a photo
        </Button>
      }
    >
      {confirmElement}

      <Loaded resource={photos} skeletonHeight="10rem">
        {() => (
          <>
            <section className="desk-section">
              <h2 className="card__title">
                Waiting for you {waiting.length > 0 ? <Badge tone="warn">{waiting.length}</Badge> : null}
              </h2>
              {waiting.length === 0 ? (
                <Nothing>Nothing waiting.</Nothing>
              ) : (
                <div className="photo-grid">
                  {waiting.map((photo) => (
                    <figure key={photo.id} className="photo-card">
                      <Photo src={photo.image_url} alt={photo.caption} />
                      <figcaption>
                        <p className="fine">{photo.caption || "No caption"}</p>
                        <p className="fine faint">
                          {photo.submitter_name || "Anonymous"}, {stampLabel(photo.created_at)}
                        </p>
                        <div className="row row--wrap">
                          <Button size="sm" tone="primary" onClick={() => update(photo.id, { is_approved: true }, "Photo published.")}>
                            Publish
                          </Button>
                          <Button
                            size="sm"
                            tone="danger"
                            onClick={async () => {
                              const ok = await confirm({
                                title: "Delete this photo?",
                                body: "It goes for good.",
                                confirmLabel: "Delete",
                              });
                              if (!ok) return;
                              try {
                                await api.desk.gallery.remove(photo.id);
                                photos.reload();
                                toast.done("Deleted.");
                              } catch (err) {
                                toast.failed(err);
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </section>

            <section className="desk-section">
              <Toolbar>
                <h2 className="card__title">On the site</h2>
                <p className="fine faint push">{live.length} photos</p>
              </Toolbar>

              {live.length === 0 ? (
                <Nothing>Nothing published yet.</Nothing>
              ) : (
                <div className="photo-grid">
                  {live.map((photo) => (
                    <figure key={photo.id} className="photo-card">
                      <Photo src={photo.image_url} alt={photo.caption} />
                      <figcaption>
                        <p className="fine">{photo.caption || "No caption"}</p>
                        <div className="row row--wrap">
                          <Button
                            size="sm"
                            tone={photo.is_featured ? "primary" : "ghost"}
                            icon="star"
                            onClick={() =>
                              update(
                                photo.id,
                                { is_featured: photo.is_featured !== 1 },
                                photo.is_featured ? "No longer featured." : "Featured."
                              )
                            }
                          >
                            {photo.is_featured ? "Featured" : "Feature"}
                          </Button>
                          <Button size="sm" tone="quiet" onClick={() => update(photo.id, { is_approved: false }, "Hidden.")}>
                            Hide
                          </Button>
                          <Button
                            size="sm"
                            tone="danger"
                            onClick={async () => {
                              const ok = await confirm({
                                title: "Delete this photo?",
                                body: "It goes for good.",
                                confirmLabel: "Delete",
                              });
                              if (!ok) return;
                              try {
                                await api.desk.gallery.remove(photo.id);
                                photos.reload();
                                toast.done("Deleted.");
                              } catch (err) {
                                toast.failed(err);
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </Loaded>

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a photo"
        description="Yours go up straight away."
        footer={
          <>
            <Button tone="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              tone="primary"
              disabled={!image}
              onClick={async () => {
                if (!image) return;
                try {
                  await api.desk.gallery.upload(image, caption.trim());
                  setAdding(false);
                  setImage(null);
                  setCaption("");
                  photos.reload();
                  toast.done("Photo added.");
                } catch (err) {
                  toast.failed(err);
                }
              }}
            >
              Add it
            </Button>
          </>
        }
      >
        <label className="dropzone">
          {image ? <img src={image} alt="" /> : <span className="dropzone__hint">Choose a photo, up to 6 MB</span>}
          <input
            type="file"
            accept={IMAGE_ACCEPT}
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                setImage(await readImageFile(file));
                setProblem(null);
              } catch (err) {
                setProblem(err instanceof ImageError ? err.message : "That photo could not be used.");
              }
            }}
          />
        </label>
        <TextField label="Caption" value={caption} maxLength={200} onChange={(e) => setCaption(e.target.value)} />
        {problem ? <Notice tone="bad">{problem}</Notice> : null}
      </Sheet>
    </DeskPage>
  );
}
