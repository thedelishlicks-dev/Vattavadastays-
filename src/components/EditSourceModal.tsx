import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal, ModalActions, Button } from "@/components/ds";
import { SourceDetailPicker } from "@/components/SourceDetailPicker";
import { supabase } from "@/lib/supabase";
import { friendlyDbError } from "@/lib/dbErrors";
import { NOT_SAVED_MESSAGE, NotSavedError } from "@/lib/bookingActions";
import { bookingSourceDetailLabel } from "@/lib/bookingSourceDetail";
import { EDITABLE_SOURCES, buildSourcePatch, canChangeSource } from "@/lib/bookingSourceEdit";
import { cn } from "@/lib/utils";
import type { BookingSource, BookingSourceDetail } from "@/types/database";

/**
 * "Change source": edit how a booking came to you after it was created. Writes ONLY `source` and
 * `booking_source_detail` (lib/bookingSourceEdit.ts builds the patch), so revenue, payments, dates, room,
 * status and the guest are untouched. A multi-room booking updates its group row and its rooms together, the
 * same way Add Booking writes them. Agent bookings keep their agent and commission.
 */
export function EditSourceModal({
  kind,
  id,
  source,
  detail,
  onClose,
  onSaved,
}: {
  kind: "booking" | "group";
  id: string;
  source: BookingSource;
  detail: string | null | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [nextSource, setNextSource] = useState<string>(source);
  const [nextDetail, setNextDetail] = useState<string>(detail ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const current = { source, booking_source_detail: detail ?? null };
  const patch = buildSourcePatch(current, { source: nextSource, detail: nextDetail });
  const isAgent = !canChangeSource(current);
  const storedLabel = bookingSourceDetailLabel(detail);

  const handleSave = async () => {
    if (!patch) return;
    setSaving(true);
    setError("");
    try {
      if (kind === "group") {
        // .select("id"): an expired login updates ZERO rows without any error; an empty answer is a failure.
        const { data: groupRows, error: groupErr } = await supabase
          .from("booking_groups")
          .update(patch)
          .eq("id", id)
          .select("id");
        if (groupErr) throw groupErr;
        if (!groupRows || groupRows.length === 0) throw new NotSavedError();
        const { error: roomsErr } = await supabase
          .from("bookings")
          .update(patch)
          .eq("group_id", id);
        if (roomsErr) throw roomsErr;
      } else {
        const { data: rows, error: err } = await supabase
          .from("bookings")
          .update(patch)
          .eq("id", id)
          .select("id");
        if (err) throw err;
        if (!rows || rows.length === 0) throw new NotSavedError();
      }
      queryClient.invalidateQueries({ queryKey: ["bookings"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["bookingGroups"], exact: false });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof NotSavedError ? NOT_SAVED_MESSAGE : friendlyDbError(e, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      nested
      title="Change source"
      subtitle="How did this guest find you?"
      onClose={onClose}
      footer={
        <>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <ModalActions>
            <Button variant="soft" size="lg" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={handleSave}
              disabled={!patch}
              loading={saving}
            >
              Save
            </Button>
          </ModalActions>
        </>
      }
    >
      {isAgent ? (
        <p className="rounded-2xl bg-muted/60 px-4 py-3 text-sm">
          This is an <strong>agent</strong> booking. The agent and commission stay as they are; you
          can still note how the guest found you below.
        </p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Booked</p>
          <div role="radiogroup" aria-label="Booked" className="flex gap-2">
            {EDITABLE_SOURCES.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={nextSource === o.value}
                onClick={() => setNextSource(o.value)}
                className={cn(
                  "rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                  nextSource === o.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground/80 hover:bg-muted/70",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <SourceDetailPicker
        value={nextDetail as BookingSourceDetail}
        onChange={(v) => setNextDetail(v)}
      />
      {nextDetail !== "" && (
        <button
          type="button"
          onClick={() => setNextDetail("")}
          className="text-xs font-medium text-primary"
        >
          Clear source detail
        </button>
      )}
      {storedLabel && !patch && (
        <p className="text-xs text-muted-foreground">Currently recorded as {storedLabel}.</p>
      )}
    </Modal>
  );
}
