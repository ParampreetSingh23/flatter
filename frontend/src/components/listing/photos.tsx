"use client";
import { useRef, useState } from "react";
import { ApiFail } from "@/lib/api";
import { CATEGORIES, type ListingView, type PhotoCategory } from "@/lib/listing-types";
import { btnBack, btnNext } from "../onboarding/fields";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

interface Slot { photoId: string; uploadUrl: string; headers: Record<string, string> }
interface Item { key: string; file: File; category: PhotoCategory; status: "uploading" | "processing" | "error"; pct: number; message: string; photoId?: string }

type Call = <T>(method: string, path: string, body?: unknown) => Promise<T>;
export interface PhotosProps {
  listing: ListingView;
  getVersion: () => number;
  apply: (l: ListingView) => void;
  call: Call;
  report: (message: string) => void;
}

function put(url: string, file: File, headers: Record<string, string>, onPct: (n: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => e.lengthComputable && onPct(Math.round((e.loaded / e.total) * 100));
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error("The upload was rejected. Please try again.")));
    x.onerror = () => reject(new Error("Network error during upload. Please try again."));
    x.send(file);
  });
}

export function PhotosBlock({ listing, getVersion, apply, call, report }: PhotosProps) {
  const [queue, setQueue] = useState<Item[]>([]);
  const [category, setCategory] = useState<PhotoCategory>("ROOM");
  const [order, setOrder] = useState<string[] | null>(null);
  const [cats, setCats] = useState<Record<string, PhotoCategory>>({});
  const [cover, setCover] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const closed = listing.status === "CLOSED";

  const patch = (key: string, p: Partial<Item>) => setQueue((q) => q.map((i) => (i.key === key ? { ...i, ...p } : i)));

  async function run(item: Item) {
    patch(item.key, { status: "uploading", pct: 0, message: "" });
    try {
      const slot = await call<Slot>("POST", `/api/listings/${listing.id}/photos/uploads`, {
        version: getVersion(), contentType: item.file.type, bytes: item.file.size, category: item.category, filename: item.file.name,
      });
      patch(item.key, { photoId: slot.photoId });
      await put(slot.uploadUrl, item.file, slot.headers, (pct) => patch(item.key, { pct }));
      patch(item.key, { status: "processing" });
      apply(await call<ListingView>("POST", `/api/listings/${listing.id}/photos/${slot.photoId}/complete`, {}));
      setQueue((q) => q.filter((i) => i.key !== item.key));
    } catch (e) {
      patch(item.key, { status: "error", message: e instanceof Error ? e.message : "Upload failed." });
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const items: Item[] = [...files].map((file) => ({ key: crypto.randomUUID(), file, category, status: "uploading", pct: 0, message: "" }));
    const bad = (f: File) =>
      !ALLOWED.includes(f.type) ? "Unsupported format. Export it as JPEG, PNG or WebP (HEIC, GIF and SVG aren't supported)." : f.size > MAX_BYTES ? "Larger than 5 MB." : "";
    setQueue((q) => [...q, ...items.map((i) => ({ ...i, status: "error" as const, message: bad(i.file) })).filter((i) => i.message)]);
    if (input.current) input.current.value = "";
    for (const item of items) if (!bad(item.file)) {
      setQueue((q) => [...q, item]);
      await run(item); // one at a time so each upload uses the latest listing version
    }
  }

  async function remove(photoId: string, ready: boolean) {
    try {
      apply(await call<ListingView>("DELETE", `/api/listings/${listing.id}/photos/${photoId}${ready ? `?version=${getVersion()}` : ""}`));
      setOrder(null); setCover(undefined);
      setCats((c) => Object.fromEntries(Object.entries(c).filter(([id]) => id !== photoId)));
    } catch (e) {
      report(e instanceof ApiFail ? e.message : "Couldn't remove that photo.");
    }
  }

  const ready = listing.photos.filter((p) => p.state === "READY");
  const ids = order ? [...order.filter((i) => ready.some((p) => p.id === i)), ...ready.filter((p) => !order.includes(p.id)).map((p) => p.id)] : ready.map((p) => p.id);
  const shown = ids.map((id) => ready.find((p) => p.id === id)!);
  const coverId = cover === undefined ? listing.coverPhotoId : cover;
  const dirty = order !== null || Object.keys(cats).length > 0 || cover !== undefined;
  const move = (i: number, d: number) => {
    const next = [...ids];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    setOrder(next);
  };

  async function saveOrder() {
    setSaving(true);
    try {
      apply(await call<ListingView>("PATCH", `/api/listings/${listing.id}/photos`, {
        version: getVersion(), photos: shown.map((p) => ({ id: p.id, category: cats[p.id] ?? p.category })), coverPhotoId: coverId ?? null,
      }));
      setOrder(null); setCats({}); setCover(undefined);
    } catch (e) {
      report(e instanceof ApiFail ? e.message : "Couldn't save photo changes.");
    } finally {
      setSaving(false);
    }
  }

  const failed = listing.photos.filter((p) => p.state === "FAILED" || p.state === "PENDING" || p.state === "PROCESSING");
  return (
    <div className="grid gap-6 lg:gap-4">
      <div>
        <p className="text-sm text-muted">
          Add 3–10 photos: JPEG, PNG or WebP, up to 5 MB each, at least 640 × 480 pixels. Include a room photo and a shared-space photo.
          Avoid documents, street names and other people. HEIC, GIF and SVG aren&apos;t supported; export as JPEG or PNG first.
          We remove location data from every photo. Photos are visible only to signed-in Flatter users once you publish.
        </p>
        {closed ? <p className="mt-4 font-bold">Reopen this listing to add photos.</p> : (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm font-bold">Next photos are
              <select value={category} onChange={(e) => setCategory(e.target.value as PhotoCategory)} className="rounded-2xl border border-hairline bg-white px-3 py-3 font-normal">
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            <label className={`${btnNext} cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2`}>
              Choose photos
              <input ref={input} type="file" multiple accept={ALLOWED.join(",")} className="sr-only" onChange={(e) => void onFiles(e.target.files)} />
            </label>
          </div>
        )}
      </div>

      {queue.length > 0 && (
        <ul className="grid gap-2" aria-label="Uploads">
          {queue.map((i) => (
            <li key={i.key} className="rounded-2xl border border-hairline bg-white p-3 text-sm">
              <span className="font-bold">{i.file.name}</span>{" "}
              {i.status === "uploading" && <span role="status">Uploading… {i.pct}%</span>}
              {i.status === "processing" && <span role="status">Checking photo…</span>}
              {i.status === "error" && (
                <>
                  <span role="alert" className="text-error">{i.message}</span>
                  <span className="ml-3 inline-flex flex-wrap gap-2">
                    {ALLOWED.includes(i.file.type) && i.file.size <= MAX_BYTES && <button type="button" onClick={() => void run(i)} className={`${btnBack} px-3! py-2!`}>Retry<span className="sr-only"> {i.file.name}</span></button>}
                    <button type="button" onClick={() => { if (i.photoId) void remove(i.photoId, false); setQueue((q) => q.filter((x) => x.key !== i.key)); }} className={`${btnBack} px-3! py-2!`}>Dismiss<span className="sr-only"> {i.file.name}</span></button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div>
        <h3 className="font-bold">Your photos ({ready.length} of 10)</h3>
        {shown.length === 0 ? <p className="mt-2 text-sm text-muted">No photos yet. You can save your listing and add photos later.</p> : (
          <ol className="mt-3 grid gap-4 sm:grid-cols-2">
            {shown.map((p, n) => {
              const cat = cats[p.id] ?? p.category;
              const label = CATEGORIES.find((c) => c.value === cat)?.label;
              return (
                <li key={p.id} className="rounded-2xl bg-white p-3">
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt={`Photo ${n + 1} of your flat: ${label}`} className="aspect-4/3 w-full rounded-2xl object-cover" />
                  ) : <div className="flex aspect-4/3 items-center justify-center rounded-2xl bg-surface-card text-sm">Preview unavailable</div>}
                  <div className="mt-3 grid gap-2 text-sm">
                    <label className="grid gap-1 font-bold">Type
                      <select value={cat} onChange={(e) => setCats((c) => ({ ...c, [p.id]: e.target.value as PhotoCategory }))} className="rounded-2xl border border-hairline bg-white px-3 py-2 font-normal">
                        {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </label>
                    <label className="flex items-center gap-2"><input type="radio" name="cover" checked={coverId === p.id} onChange={() => setCover(p.id)} className="size-4 accent-ink" /> Use as cover photo</label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={n === 0} onClick={() => move(n, -1)} className={`${btnBack} px-3! py-2!`}>Move earlier</button>
                      <button type="button" disabled={n === shown.length - 1} onClick={() => move(n, 1)} className={`${btnBack} px-3! py-2!`}>Move later</button>
                      <button type="button" onClick={() => void remove(p.id, true)} className={`${btnBack} px-3! py-2!`}>Remove<span className="sr-only"> photo {n + 1}</span></button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {dirty && (
          <div className="mt-4 flex items-center gap-3">
            <button type="button" disabled={saving} onClick={() => void saveOrder()} className={btnNext}>{saving ? "Saving…" : "Save photo changes"}</button>
            <p className="text-sm text-muted">Saving changes to a published listing pauses it until you republish.</p>
          </div>
        )}
      </div>

      {failed.length > 0 && (
        <div>
          <h3 className="font-bold">Not accepted</h3>
          <ul className="mt-2 grid gap-2 text-sm">
            {failed.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-2xl border border-hairline bg-white p-3">
                <span>{p.originalName ?? "Photo"} — {p.state === "FAILED" ? "rejected" : "waiting to finish"}</span>
                <button type="button" onClick={() => void remove(p.id, false)} className={`${btnBack} px-3! py-2!`}>Remove<span className="sr-only"> {p.originalName ?? "photo"}</span></button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
