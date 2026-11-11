// src/components/ChannelSyncModal.tsx
//
// "Sync with other sites": per room, (1) a link to give Booking.com / Airbnb /
// Agoda / MakeMyTrip so they stop selling nights you sold directly, and
// (2) their calendar links to import, so nights they sold can't be booked here.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle2, Copy, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Modal, ModalActions, Button, fieldCls } from "@/components/ds";
import { supabase } from "@/lib/supabase";
import { friendlyDbError } from "@/lib/dbErrors";
import { exportFeedUrl, syncIcalFeeds } from "@/lib/icalClient";
import { icalFeedsKey, invalidateAvailability, useIcalFeeds, type IcalFeed } from "@/hooks/useIcalFeeds";
import { normalizeFeedUrl } from "../../api/_lib/ical";

const SITES = ["Booking.com", "Airbnb", "Agoda", "MakeMyTrip", "Goibibo", "Google Calendar", "Other"];

interface Props {
  propertyId: string;
  rooms: { id: string; name: string }[];
  onClose: () => void;
}

export function ChannelSyncModal({ propertyId, rooms, onClose }: Props) {
  const qc = useQueryClient();
  const { data: feeds = [], isError } = useIcalFeeds(propertyId);
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [site, setSite] = useState(SITES[0]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"add" | "sync" | string | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [copied, setCopied] = useState(false);

  const roomFeeds = feeds.filter((f) => f.room_id === roomId);
  const exportUrl = roomId ? exportFeedUrl(window.location.origin, roomId) : "";

  const refresh = () => { invalidateAvailability(qc); qc.invalidateQueries({ queryKey: icalFeedsKey(propertyId) }); };

  const copy = async () => {
    try { await navigator.clipboard.writeText(exportUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setError("Couldn't copy automatically — long-press the link to copy it."); }
  };

  const syncNow = async (scope: { feed_id?: string; room_id?: string }) => {
    setBusy("sync"); setError(""); setInfo("");
    try {
      const results = await syncIcalFeeds(scope);
      refresh();
      const bad = results.filter((r) => !r.ok);
      if (bad.length) setError(bad.map((r) => r.message).join(" "));
      else setInfo(results.length ? "Synced. Calendar is up to date." : "Nothing to sync yet.");
    } catch (e) { setError(e instanceof Error ? e.message : "Sync failed."); }
    finally { setBusy(null); }
  };

  const addFeed = async () => {
    setError(""); setInfo("");
    const check = normalizeFeedUrl(url);
    if (!check.ok) { setError(check.error); return; }
    setBusy("add");
    try {
      const { data, error: err } = await supabase
        .from("room_ical_feeds")
        .insert({ property_id: propertyId, room_id: roomId, name: site, url: check.url })
        .select("id")
        .single();
      if (err) throw err;
      setUrl("");
      qc.invalidateQueries({ queryKey: icalFeedsKey(propertyId) });
      await syncNow({ feed_id: data.id });
    } catch (e) { setError(friendlyDbError(e, "Could not save that link.")); setBusy(null); }
  };

  const removeFeed = async (f: IcalFeed) => {
    if (!window.confirm(`Stop syncing ${f.name}? Nights it blocked will be released on your calendar at the next sync.`)) return;
    setBusy(f.id); setError("");
    try {
      // Release this feed's nights right away (only rows carrying its own note), then delete the link.
      await supabase.from("availability").delete().eq("room_id", f.room_id).like("note", `ical:${f.id}%`);
      const { error: err } = await supabase.from("room_ical_feeds").delete().eq("id", f.id);
      if (err) throw err;
      refresh();
    } catch (e) { setError(friendlyDbError(e)); }
    finally { setBusy(null); }
  };

  return (
    <Modal
      size="lg"
      title="Sync with other sites"
      onClose={onClose}
      footer={
        <ModalActions>
          <Button variant="soft" size="lg" onClick={() => syncNow({ room_id: roomId })} disabled={busy !== null || roomFeeds.length === 0} loading={busy === "sync"}>
            {busy !== "sync" && <RefreshCw className="h-4 w-4" />} Sync now
          </Button>
          <Button size="lg" className="flex-1" onClick={onClose}>Done</Button>
        </ModalActions>
      }
    >
          <p className="text-sm text-muted-foreground">
            Selling the same room on Booking.com or Airbnb too? Link calendars so one booking blocks the night everywhere — no double bookings.
          </p>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Room</label>
            <select className={fieldCls} value={roomId} onChange={(e) => { setRoomId(e.target.value); setError(""); setInfo(""); }}>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">1 · Tell other sites what you’ve sold</h3>
            <p className="text-xs text-muted-foreground">
              Copy this link and paste it into <em>Import calendar</em> on Booking.com / Airbnb / Agoda / MakeMyTrip for this room.
              It shows only “Reserved” dates — no guest details.
            </p>
            <div className="flex gap-2">
              <input readOnly value={exportUrl} className={`${fieldCls} text-xs`} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" onClick={copy} className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-muted px-4 text-sm font-medium hover:bg-muted/70">
                {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy"}
              </button>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">2 · Bring in what other sites have sold</h3>
            {isError && <p className="text-xs text-destructive">Couldn’t load your saved links. If this persists, the sync table may not be set up yet.</p>}

            {roomFeeds.length === 0 && <p className="text-xs text-muted-foreground">No links added for this room yet.</p>}
            {roomFeeds.map((f) => (
              <div key={f.id} className="rounded-2xl bg-muted/60 px-4 py-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{f.name}</span>
                  <button type="button" onClick={() => removeFeed(f)} disabled={busy === f.id} className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground" aria-label={`Remove ${f.name}`}>
                    {busy === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {f.last_status === "error" ? (
                  <p className="text-xs text-destructive flex gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{f.last_message}</p>
                ) : f.last_status === "ok" ? (
                  <p className={`text-xs flex gap-1.5 ${(f.last_conflicts ?? 0) > 0 ? "text-amber-700" : "text-muted-foreground"}`}>
                    {(f.last_conflicts ?? 0) > 0 ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-green-600" />}
                    {f.last_message}
                  </p>
                ) : <p className="text-xs text-muted-foreground">Not synced yet.</p>}
                {f.last_synced_at && <p className="text-[11px] text-muted-foreground">Last checked {formatDistanceToNow(new Date(f.last_synced_at), { addSuffix: true })}</p>}
              </div>
            ))}

            <div className="rounded-2xl bg-muted/60 p-3 space-y-2">
              <div className="grid grid-cols-[8.5rem_1fr] gap-2">
                <select className={fieldCls} value={site} onChange={(e) => setSite(e.target.value)}>{SITES.map((s) => <option key={s}>{s}</option>)}</select>
                <input className={fieldCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste their calendar link (https:// or webcal://)" inputMode="url" autoCapitalize="none" autoCorrect="off" />
              </div>
              <Button block onClick={addFeed} disabled={busy !== null || !url.trim()} loading={busy === "add"}>Add &amp; sync</Button>
              <p className="text-[11px] text-muted-foreground">Find it under <em>Calendar → Export / Sync calendar</em> on the other site. Treat the link like a password.</p>
            </div>
          </section>

          {info && <p className="text-xs text-green-700">{info}</p>}
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          <p className="text-[11px] text-muted-foreground">
            Other sites refresh your link every few hours, so very recent bookings can take a while to appear there. For same-day bookings, block the room on the other site by hand too.
          </p>
    </Modal>
  );
}
