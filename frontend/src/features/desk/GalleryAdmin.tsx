import { useState } from "react";
import { api } from "~/lib/api";
import { useMutation, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { timeAgo } from "~/lib/format";
import { readImageFile } from "~/lib/imageFile";
import { Action, Button, IconButton } from "~/ui/Button";
import { TextField, Segmented } from "~/ui/Field";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { Img } from "~/ui/Img";
import { DeskPage, Loaded, Nothing, State } from "./parts";
import { useToast } from "~/state/toast";

/**
 * What shows in the site's gallery.
 *
 * Guests can send photographs in and they land here rather than on the site,
 * which is the only sane default for anything a stranger can upload to a
 * restaurant's front page. Waiting is the first tab for that reason: it is the
 * one that needs somebody, and an unreviewed queue is a queue that stops
 * getting used.
 */

type Tab = "waiting" | "showing" | "all";

export function GalleryAdmin() {
  const toast = useToast();
  const { confirm, element } = useConfirm();
  const [tab, setTab] = useState<Tab>("waiting");
  const [adding, setAdding] = useState(false);

  const photos = useQuery(K.desk.gallery, () => api.desk.gallery.all(), { staleMs: 30_000 });

  function refresh() {
    invalidate("desk.gallery*");
    invalidate(K.gallery);
    photos.reload();
  }

  const setApproved = useMutation(async (input: { id: number; approved: boolean }) => {
    await api.desk.gallery.update(input.id, { is_approved: input.approved });
    refresh();
  });

  const setFeatured = useMutation(async (input: { id: number; featured: boolean }) => {
    await api.desk.gallery.update(input.id, { is_featured: input.featured });
    refresh();
  });

  const remove = useMutation(async (id: number) => {
    await api.desk.gallery.remove(id);
    refresh();
    toast.done("Deleted.");
  });

  const all = photos.data ?? [];
  const waiting = all.filter((photo) => photo.is_approved === 0);
  const shown = tab === "waiting" ? waiting : tab === "showing" ? all.filter((p) => p.is_approved === 1) : all;

  return (
    <DeskPage
      title="Photos"
      hint="Approve what customers send in, and add your own."
      actions={
        <Button size="sm" tone="primary" icon="camera" onClick={() => setAdding(true)}>
          Add a photo
        </Button>
      }
    >
      <Segmented
        value={tab}
        onChange={setTab}
        label="Which photos"
        options={[
          { value: "waiting", label: waiting.length > 0 ? `Waiting (${waiting.length})` : "Waiting" },
          { value: "showing", label: "Showing" },
          { value: "all", label: "All" },
        ]}
      />

      <Loaded query={photos}>
        {() =>
          shown.length === 0 ? (
            <Nothing icon="image">
              {tab === "waiting" ? "Nothing waiting. All caught up." : "No photos here."}
            </Nothing>
          ) : (
            <div className="dk-photos">
              {shown.map((photo) => (
                <figure key={photo.id} className="dk-photo">
                  <Img src={photo.image_url} alt={photo.caption || ""} ratio={1} radius="var(--r-sm)" />

                  <figcaption className="stack stack--tight">
                    <span className="fine clip">{photo.caption || <span className="faint">No caption</span>}</span>
                    <span className="micro faint">
                      {photo.submitter_name || "Us"} · {timeAgo(photo.created_at)}
                    </span>
                    <span className="bar bar--tight">
                      {photo.is_approved === 1 ? <State tone="good">Showing</State> : <State tone="warn">Waiting</State>}
                      {photo.is_featured === 1 ? <State tone="hot">Featured</State> : null}
                    </span>
                  </figcaption>

                  <div className="bar bar--tight">
                    <Action
                      size="sm"
                      tone={photo.is_approved === 1 ? "quiet" : "primary"}
                      block
                      pending={setApproved.pendingFor(photo.id)}
                      pendingLabel="Saving"
                      onClick={() => void setApproved.run({ id: photo.id, approved: photo.is_approved === 0 })}
                    >
                      {photo.is_approved === 1 ? "Take down" : "Approve"}
                    </Action>
                    <IconButton
                      name="sparkle"
                      label={photo.is_featured === 1 ? "Unfeature" : "Feature"}
                      size="sm"
                      pending={setFeatured.pendingFor(photo.id)}
                      onClick={() => void setFeatured.run({ id: photo.id, featured: photo.is_featured === 0 })}
                    />
                    <IconButton
                      name="trash"
                      label="Delete"
                      size="sm"
                      pending={remove.pendingFor(photo.id)}
                      onClick={async () => {
                        const sure = await confirm({
                          title: "Delete this photo?",
                          body: "It goes for good.",
                          confirmLabel: "Delete it",
                        });
                        if (!sure) return;
                        await remove.run(photo.id);
                      }}
                    />
                  </div>
                </figure>
              ))}
            </div>
          )
        }
      </Loaded>

      <AddPhoto
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setAdding(false);
          refresh();
          toast.done("Added.");
        }}
      />

      {element}
    </DeskPage>
  );
}

function AddPhoto({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const toast = useToast();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");

  const upload = useMutation(async () => {
    if (!dataUrl) return;
    await api.desk.gallery.upload(dataUrl, caption.trim());
    setDataUrl(null);
    setCaption("");
    onAdded();
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a photo"
      footer={
        <Action
          tone="primary"
          block
          pending={upload.pending}
          pendingLabel="Uploading"
          disabled={!dataUrl}
          onClick={async () => {
            await upload.run();
            const error = upload.readError();
            if (error) toast.failed(error, "upload");
          }}
        >
          Add it
        </Action>
      }
    >
      <div className="stack">
        <label className="dropzone">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                setDataUrl(await readImageFile(file));
              } catch (error) {
                toast.failed(error, "upload");
              }
            }}
          />
          {dataUrl ? (
            <Img src={dataUrl} alt="" ratio={4 / 3} />
          ) : (
            <span className="dropzone__prompt fine muted">Choose a photo, under 6 MB</span>
          )}
        </label>

        <TextField
          label="Caption"
          hint="Optional."
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          maxLength={120}
        />
      </div>
    </Sheet>
  );
}
