import { useRef, useState } from "react";
import { ImageOff, Loader2, Star, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { validateAndCompress } from "@/lib/imageUtils";
import { MAX_ROOM_PHOTOS } from "@/lib/gallery";

const BUCKET = "room-images";

type Props = {
  roomId: string;
  propertyId: string;
  photos: string[];
  /** Called after the room's photos were saved, so the list can refresh. */
  onChanged: () => void;
};

/** Owner screen for one room's photos: up to 6, each saved as soon as it is uploaded. The first one is the card photo. */
export function RoomPhotosManager({ roomId, propertyId, photos, onChanged }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const room = MAX_ROOM_PHOTOS - photos.length;

  const save = async (urls: string[]) => {
    const { error: dbError } = await supabase.from("rooms").update({ images: urls }).eq("id", roomId);
    if (dbError) throw dbError;
    onChanged();
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    const files = picked.slice(0, Math.max(0, room));
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;
    setBusy(true);
    setError("");
    let current = photos;
    const problems: string[] = [];
    for (let i = 0; i < files.length; i++) {
      setProgress(`Uploading ${i + 1} of ${files.length}…`);
      try {
        const { file } = await validateAndCompress(files[i], "room");
        const path = `${propertyId}/${roomId}-${Date.now()}-${i}.webp`;
        const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: "image/webp" });
        if (up.error) throw up.error;
        current = [...current, supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl];
        await save(current); // saved one by one, so a later failure never loses earlier photos
      } catch (err) {
        problems.push(`${files[i].name}: ${typeof err === "string" ? err : (err as Error).message ?? "upload failed"}`);
      }
    }
    if (picked.length > files.length) problems.push(`Only ${MAX_ROOM_PHOTOS} photos fit per room; the rest were skipped.`);
    setError(problems.join(" · "));
    setProgress("");
    setBusy(false);
  };

  const remove = async (url: string) => {
    setError("");
    try {
      await save(photos.filter((u) => u !== url));
      // Best effort: free the storage too (ignored if the bucket doesn't allow deletes).
      const marker = `/object/public/${BUCKET}/`;
      const at = url.indexOf(marker);
      if (at >= 0) await supabase.storage.from(BUCKET).remove([decodeURIComponent(url.slice(at + marker.length).split("?")[0])]);
    } catch (err) {
      setError((err as Error).message ?? "Could not remove the photo");
    }
  };

  const makeFirst = async (url: string) => {
    setError("");
    try {
      await save([url, ...photos.filter((u) => u !== url)]);
    } catch (err) {
      setError((err as Error).message ?? "Could not reorder");
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Room photos ({photos.length}/{MAX_ROOM_PHOTOS})</p>

      {photos.length === 0 ? (
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="w-full border-2 border-dashed border-border rounded-lg h-36 flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-muted/30 transition-colors disabled:opacity-60">
          {busy ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">{progress}</span>
            </>
          ) : (
            <>
              <ImageOff className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Tap to add photos</span>
              <span className="text-[10px] text-muted-foreground/60">You can pick several at once · JPG / PNG / WebP</span>
            </>
          )}
        </button>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((url, i) => (
              <div key={url} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                <img src={url} alt={`Room photo ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
                <button type="button" onClick={() => remove(url)} aria-label="Remove photo" className="absolute top-1 right-1 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"><X className="h-3.5 w-3.5" /></button>
                {i === 0 ? (
                  <span className="absolute bottom-1 left-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">Main</span>
                ) : (
                  <button type="button" onClick={() => makeFirst(url)} aria-label="Make this the main photo" className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white hover:bg-black/80"><Star className="h-3 w-3" /> Make main</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" disabled={busy || room <= 0} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-full border border-primary/40 px-4 py-2 text-sm font-medium text-primary hover:bg-primary-light disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {busy ? progress : room <= 0 ? "Room is full" : "Add photos"}
          </button>
        </>
      )}

      <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic" className="hidden" onChange={handleFiles} />
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
