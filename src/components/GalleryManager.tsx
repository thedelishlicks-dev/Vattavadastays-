import { useRef, useState } from "react";
import { Loader2, Star, Upload, X, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { validateAndCompress } from "@/lib/imageUtils";
import { MAX_GALLERY_PHOTOS, normalizeInstagram, thumbPath, thumbUrl } from "@/lib/gallery";

const BUCKET = "hero-images";
const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

type Props = {
  propertyId: string;
  photos: string[];
  /** Saves the new list straight away (throws on failure). */
  onChange: (urls: string[]) => Promise<void>;
};

/** Owner screen for the guest-page gallery: up to 12 photos, each stored as a full photo plus a small thumbnail. */
export function GalleryManager({ propertyId, photos, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const room = MAX_GALLERY_PHOTOS - photos.length;

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, Math.max(0, room));
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;
    setBusy(true);
    setError("");
    let current = photos;
    const problems: string[] = [];
    for (let i = 0; i < files.length; i++) {
      setProgress(`Uploading ${i + 1} of ${files.length}…`);
      try {
        const [full, thumb] = await Promise.all([validateAndCompress(files[i], "gallery"), validateAndCompress(files[i], "galleryThumb")]);
        const path = `${propertyId}/gallery-${Date.now()}-${i}.webp`;
        const up = await supabase.storage.from(BUCKET).upload(path, full.file, { upsert: true, contentType: "image/webp" });
        if (up.error) throw up.error;
        const upThumb = await supabase.storage.from(BUCKET).upload(thumbPath(path), thumb.file, { upsert: true, contentType: "image/webp" });
        if (upThumb.error) throw upThumb.error;
        current = [...current, supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl];
        await onChange(current); // saved one by one, so a later failure never loses earlier photos
      } catch (err) {
        problems.push(`${files[i].name}: ${typeof err === "string" ? err : (err as Error).message ?? "upload failed"}`);
      }
    }
    if (e.target.files && Array.from(e.target.files).length > room) problems.push(`Only ${MAX_GALLERY_PHOTOS} photos fit; the rest were skipped.`);
    setError(problems.join(" · "));
    setProgress("");
    setBusy(false);
  };

  const remove = async (url: string) => {
    setError("");
    try {
      await onChange(photos.filter((u) => u !== url));
      // Best effort: free the storage too (ignored if the bucket doesn't allow deletes).
      const marker = `/object/public/${BUCKET}/`;
      const at = url.indexOf(marker);
      if (at >= 0) {
        const path = decodeURIComponent(url.slice(at + marker.length).split("?")[0]);
        await supabase.storage.from(BUCKET).remove([path, thumbPath(path)]);
      }
    } catch (err) {
      setError((err as Error).message ?? "Could not remove the photo");
    }
  };

  const makeFirst = async (url: string) => {
    setError("");
    try {
      await onChange([url, ...photos.filter((u) => u !== url)]);
    } catch (err) {
      setError((err as Error).message ?? "Could not reorder");
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Gallery ({photos.length}/{MAX_GALLERY_PHOTOS})</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Your best photos of the property, the views and the food. The first photo is shown large. Each photo is made small automatically (about 140 KB, with a 30 KB preview) so the page stays quick on mobile.
        </p>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map((url, i) => (
            <div key={url} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
              <img
                src={thumbUrl(url)}
                alt={`Gallery photo ${i + 1}`}
                loading="lazy"
                className="h-full w-full object-cover"
                onError={(ev) => { const img = ev.currentTarget; if (img.dataset.fb !== "1") { img.dataset.fb = "1"; img.src = url; } }}
              />
              <button type="button" onClick={() => remove(url)} aria-label="Remove photo" className="absolute top-1 right-1 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"><X className="h-3.5 w-3.5" /></button>
              {i === 0 ? (
                <span className="absolute bottom-1 left-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">Large</span>
              ) : (
                <button type="button" onClick={() => makeFirst(url)} aria-label="Make this the large photo" className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white hover:bg-black/80"><Star className="h-3 w-3" /> Make first</button>
              )}
            </div>
          ))}
        </div>
      )}

      <button type="button" disabled={busy || room <= 0} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-full border border-primary/40 px-4 py-2 text-sm font-medium text-primary hover:bg-primary-light disabled:opacity-40">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {busy ? progress : room <= 0 ? "Gallery is full" : "Add photos"}
      </button>
      <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic" className="hidden" onChange={handleFiles} />
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

type IgProps = { value: string | null; onSave: (handle: string | null) => Promise<void> };

/** Instagram handle (or pasted link). Saves straight away like the photos above it. */
export function InstagramField({ value, onSave }: IgProps) {
  const [text, setText] = useState(value ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");

  const save = async () => {
    const n = normalizeInstagram(text);
    if (n === "invalid") { setError("Use only your Instagram username (letters, numbers, . and _), or paste your profile link."); return; }
    setError("");
    setState("saving");
    try {
      await onSave(n);
      setText(n ?? "");
      setState("saved");
      setTimeout(() => setState("idle"), 2000);
    } catch (err) {
      setError((err as Error).message ?? "Could not save");
      setState("idle");
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Instagram</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Your username or profile link. Guests see a "Follow" button in the gallery and in the page footer. Leave empty to hide it.</p>
      </div>
      <div className="flex gap-2">
        <input type="text" value={text} onChange={(e) => { setText(e.target.value); setState("idle"); }} placeholder="@yourstay" autoCapitalize="none" autoCorrect="off" className={inputCls} />
        <button type="button" onClick={save} disabled={state === "saving"} className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {state === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : state === "saved" ? <Check className="h-4 w-4" /> : null}
          {state === "saved" ? "Saved" : "Save"}
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
