// src/hooks/useEducationProgress.ts
//
// Lesson progress for the signed-in owner on the property they are managing. Wiring only: every rule
// (the storage key, validation, what counts as completed) is in src/lib/education.ts and tested there.
//
// Scoped by user AND property. While either is still loading there is no key, so nothing is read or
// written (`ready` is false) and there is no shared fallback. When the key changes (a superadmin
// switching property) the previous property's ticks are never shown under the new one.
//
// Progress lives in the browser for now. To move it to Supabase later, replace loadProgress /
// saveProgress here; the screens only use `completed`, `isDone`, `setDone` and `ready`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { browserStore } from "@/lib/bookingConfirmation";
import {
  completedIds,
  loadProgress,
  progressKey,
  saveProgress,
  setLessonDone,
  type ProgressMap,
} from "@/lib/education";

const EMPTY: ProgressMap = {};

/** The ?property= the admin is showing (superadmin "manage property"), as AdminLayout reads it. */
export function educationPropertyParam(): string {
  if (typeof window === "undefined") return "";
  const fromUrl = new URLSearchParams(window.location.search).get("property") ?? "";
  if (fromUrl) return fromUrl;
  try {
    return window.sessionStorage.getItem("adminPropertySubdomain") ?? "";
  } catch {
    return "";
  }
}

export function useEducationProgress() {
  const { user } = useAuth();
  const { data: property } = useOwnerProperty();
  const key = progressKey(user?.id, property?.id);

  const [state, setState] = useState<{ key: string | null; map: ProgressMap }>({
    key: null,
    map: EMPTY,
  });
  // Saved progress is read synchronously for the CURRENT key, so the very first render already shows it
  // (no flash of "0 of 12") and nothing can be written before it has been read. A map held for a
  // different key (another property) is never used.
  const loaded = useMemo(() => ({ key, map: loadProgress(browserStore(), key) }), [key]);
  const map = (state.key === key ? state : loaded).map;
  const mapRef = useRef(map);
  mapRef.current = map;

  // Another tab on the same property ticked something.
  useEffect(() => {
    if (!key) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setState({ key, map: loadProgress(browserStore(), key) });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const completed = useMemo(() => completedIds(map), [map]);

  const setDone = useCallback(
    (lessonId: string, done: boolean) => {
      if (!key) return;
      const next = setLessonDone(mapRef.current, lessonId, done, new Date());
      // If the browser refuses to save (private mode), the tick still shows for this visit.
      saveProgress(browserStore(), key, next);
      setState({ key, map: next });
    },
    [key],
  );

  return {
    /** False until the user and property are known: progress cannot be saved yet. */
    ready: key !== null,
    completed,
    isDone: (lessonId: string) => completed.has(lessonId),
    setDone,
  };
}
