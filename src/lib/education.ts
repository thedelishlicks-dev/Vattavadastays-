// src/lib/education.ts
//
// Pure logic behind Education (/admin/education). No React, no Supabase, no clock (callers pass
// `now`); tested in education.test.ts.
//
// Four jobs, all small:
//   1. read the lesson list (published only, in order, by category, next lesson);
//   2. check that the content is valid (unique ids, slugs and order; real destinations; sane links);
//   3. turn a lesson's destination into a link that carries ?property= (or into nothing);
//   4. keep lesson progress per USER and per PROPERTY, in the browser, behind a tiny interface.
//
// Progress is a first step. It is stored in localStorage under a key that names both the signed-in
// user and the property, so two owners on one phone, or a superadmin switching properties, never see
// each other's ticks. The stored shape is `{ v: 1, completed: { [lessonId]: "ISO date" } }`, which maps
// one-to-one onto a future Supabase table (user_id, property_id, lesson_id, completed_at). Moving
// there later means replacing loadProgress / saveProgress and nothing else.

import {
  EDUCATION_CATEGORIES,
  EDUCATION_LESSONS,
  type EducationCategoryId,
  type EducationLesson,
} from "../content/educationLessons";
import { EDUCATION_DESTINATIONS, isDestinationKey } from "./educationDestinations";

// ── Reading lessons ─────────────────────────────────────────────────────────

/** Published lessons in path order. Unpublished ones never reach a screen. */
export function publishedLessons(
  lessons: readonly EducationLesson[] = EDUCATION_LESSONS,
): EducationLesson[] {
  return lessons.filter((l) => l.published).sort((a, b) => a.order - b.order);
}

export type CategoryFilter = EducationCategoryId | "all";

export function lessonsForCategory(
  category: CategoryFilter,
  lessons: readonly EducationLesson[] = EDUCATION_LESSONS,
): EducationLesson[] {
  const all = publishedLessons(lessons);
  return category === "all" ? all : all.filter((l) => l.category === category);
}

export function findLesson(
  slug: string,
  lessons: readonly EducationLesson[] = EDUCATION_LESSONS,
): EducationLesson | undefined {
  return publishedLessons(lessons).find((l) => l.slug === slug);
}

/** The lesson after this one in the path, or null at the end. */
export function nextLesson(
  currentId: string,
  lessons: readonly EducationLesson[] = EDUCATION_LESSONS,
): EducationLesson | null {
  const list = publishedLessons(lessons);
  const i = list.findIndex((l) => l.id === currentId);
  return i >= 0 && i < list.length - 1 ? list[i + 1] : null;
}

/**
 * "Continue learning": the first lesson in the path that is not completed. With `afterId` it looks
 * only past that lesson first (so finishing lesson 4 offers lesson 5, not an unfinished lesson 2),
 * then falls back to the earliest unfinished one. Null when everything is done.
 */
export function continueLesson(
  completed: ReadonlySet<string>,
  afterId?: string,
  lessons: readonly EducationLesson[] = EDUCATION_LESSONS,
): EducationLesson | null {
  const list = publishedLessons(lessons);
  const start = afterId ? list.findIndex((l) => l.id === afterId) + 1 : 0;
  return (
    list.slice(start).find((l) => !completed.has(l.id)) ??
    list.find((l) => !completed.has(l.id) && l.id !== afterId) ??
    null
  );
}

export interface Progress {
  done: number;
  total: number;
  /** Whole number, 0 to 100. */
  percent: number;
}

export function progressFor(
  completed: ReadonlySet<string>,
  category: CategoryFilter = "all",
  lessons: readonly EducationLesson[] = EDUCATION_LESSONS,
): Progress {
  const list = lessonsForCategory(category, lessons);
  const done = list.filter((l) => completed.has(l.id)).length;
  return {
    done,
    total: list.length,
    percent: list.length === 0 ? 0 : Math.round((done / list.length) * 100),
  };
}

/** The lesson to suggest first ("Best after …"), only while it is not yet completed. */
export function prerequisiteHint(
  lesson: EducationLesson,
  completed: ReadonlySet<string>,
  lessons: readonly EducationLesson[] = EDUCATION_LESSONS,
): EducationLesson | null {
  if (!lesson.prerequisite || completed.has(lesson.prerequisite)) return null;
  return publishedLessons(lessons).find((l) => l.id === lesson.prerequisite) ?? null;
}

export function categoryTitle(id: EducationCategoryId): string {
  return EDUCATION_CATEGORIES.find((c) => c.id === id)?.title ?? id;
}

// ── Actions ─────────────────────────────────────────────────────────────────

export interface LessonAction {
  label: string;
  /** A real owner route (see educationDestinations.ts). */
  to: string;
  /** Carries ?property= so a superadmin "manage property" session stays on the right property. */
  search: { property?: string };
  /** Plain-words name of the screen, e.g. "Money → Monthly report". */
  screen: string;
}

/**
 * The action button for a lesson, or null when there is nothing safe to link to: no destination, an
 * unknown destination key, or no label. Never throws and never builds a path from free text.
 */
export function resolveAction(
  lesson: EducationLesson,
  propertyParam?: string | null,
): LessonAction | null {
  const key = lesson.destination;
  if (!key || !isDestinationKey(key) || !lesson.actionLabel.trim()) return null;
  const dest = EDUCATION_DESTINATIONS[key];
  const property = propertyParam?.trim();
  return {
    label: lesson.actionLabel,
    to: dest.to,
    search: property ? { property } : {},
    screen: dest.screen,
  };
}

/** Link to the Help section with the tap-by-tap steps (/help is public and opens in a new tab). */
export function helpHref(lesson: EducationLesson): string | null {
  return lesson.relatedHelp ? `/help#${lesson.relatedHelp}` : null;
}

// ── Content validation ──────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Every problem in a lesson list, as plain sentences ([] = valid). Used by the tests on the real
 * content, and on deliberately broken lists to prove each rule bites.
 */
export function validateLessons(lessons: readonly EducationLesson[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const orders = new Set<number>();
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const categories = new Set<string>(EDUCATION_CATEGORIES.map((c) => c.id));
  const blank = (s: string | undefined) => !s || !s.trim();

  for (const l of lessons) {
    const at = `Lesson "${l.id}"`;
    if (blank(l.id)) problems.push("A lesson has no id");
    else if (ids.has(l.id)) problems.push(`${at}: duplicate id`);
    ids.add(l.id);
    if (!SLUG_RE.test(l.slug))
      problems.push(`${at}: slug "${l.slug}" must be lowercase letters, digits and hyphens`);
    else if (slugs.has(l.slug)) problems.push(`${at}: duplicate slug "${l.slug}"`);
    slugs.add(l.slug);
    if (!Number.isFinite(l.order)) problems.push(`${at}: order must be a number`);
    else if (orders.has(l.order)) problems.push(`${at}: duplicate order ${l.order}`);
    orders.add(l.order);

    if (!categories.has(l.category)) problems.push(`${at}: unknown category "${l.category}"`);
    for (const f of ["title", "description", "whyItMatters", "measure"] as const) {
      if (blank(l[f])) problems.push(`${at}: ${f} is empty`);
    }
    if (!Number.isInteger(l.minutes) || l.minutes < 1 || l.minutes > 10) {
      problems.push(`${at}: minutes must be a whole number from 1 to 10 (lessons are short)`);
    }
    if (l.objectives.length < 2 || l.objectives.length > 3 || l.objectives.some(blank)) {
      problems.push(`${at}: needs 2 to 3 objectives`);
    }
    if (l.body.length === 0) problems.push(`${at}: body is empty`);
    if (l.actionSteps.length === 0 || l.actionSteps.some(blank))
      problems.push(`${at}: needs action steps`);

    if (l.destination !== undefined) {
      if (!isDestinationKey(l.destination))
        problems.push(`${at}: destination "${l.destination}" is not a real screen`);
      if (blank(l.actionLabel)) problems.push(`${at}: has a destination but no actionLabel`);
    }
    if (l.prerequisite !== undefined) {
      const pre = byId.get(l.prerequisite);
      if (l.prerequisite === l.id) problems.push(`${at}: is its own prerequisite`);
      else if (!pre) problems.push(`${at}: prerequisite "${l.prerequisite}" does not exist`);
      else if (pre.order >= l.order)
        problems.push(`${at}: prerequisite "${pre.id}" must come earlier in the path`);
    }
  }
  return problems;
}

// ── Progress ────────────────────────────────────────────────────────────────

/** Lesson id → ISO date it was completed. */
export type ProgressMap = Record<string, string>;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PROGRESS_PREFIX = "stayidom:education:v1";

/**
 * The storage key for one signed-in user on one property, or null when either is not known yet.
 * Never a shared or global key: with no user or no property there is nothing to save.
 */
export function progressKey(
  userId: string | null | undefined,
  propertyId: string | null | undefined,
): string | null {
  if (!userId || !propertyId) return null;
  return `${PROGRESS_PREFIX}:${userId}:${propertyId}`;
}

/** Saved progress for a key. Anything missing, unreadable or of the wrong shape counts as "no progress". */
export function loadProgress(store: Store | null | undefined, key: string | null): ProgressMap {
  if (!store || !key) return {};
  let raw: string | null = null;
  try {
    raw = store.getItem(key);
  } catch {
    return {};
  }
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; completed?: unknown };
    if (!parsed || parsed.v !== 1 || !parsed.completed || typeof parsed.completed !== "object")
      return {};
    const out: ProgressMap = {};
    for (const [id, when] of Object.entries(parsed.completed as Record<string, unknown>)) {
      if (typeof when === "string") out[id] = when;
    }
    return out;
  } catch {
    return {};
  }
}

/** Writes progress. Returns false when the browser refuses (private mode, storage full). */
export function saveProgress(
  store: Store | null | undefined,
  key: string | null,
  map: ProgressMap,
): boolean {
  if (!store || !key) return false;
  try {
    store.setItem(key, JSON.stringify({ v: 1, completed: map }));
    return true;
  } catch {
    return false;
  }
}

/** A new map with this lesson completed or not. Never changes the map it is given. */
export function setLessonDone(
  map: ProgressMap,
  lessonId: string,
  done: boolean,
  now: Date,
): ProgressMap {
  const next = { ...map };
  if (done) next[lessonId] = now.toISOString();
  else delete next[lessonId];
  return next;
}

/**
 * The completed lessons that still exist and are published. A lesson removed or unpublished later
 * drops out of the counts without erasing what the owner saved.
 */
export function completedIds(
  map: ProgressMap,
  lessons: readonly EducationLesson[] = EDUCATION_LESSONS,
): Set<string> {
  const live = new Set(publishedLessons(lessons).map((l) => l.id));
  return new Set(Object.keys(map).filter((id) => live.has(id)));
}
