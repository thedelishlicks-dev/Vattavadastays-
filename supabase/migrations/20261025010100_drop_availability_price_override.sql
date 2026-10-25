-- Removes availability.price_override. Per-date price overrides were removed
-- from the app in Oct 2026 (Phase 4B); nothing reads or writes the column.
--
-- Guard: refuses to drop the column if any row still has a value. Run
-- docs/DB_CHECKS.sql query 2 first; it must return 0.
-- Safe to run more than once.

do $$
begin
  if exists (select 1 from public.availability where price_override is not null) then
    raise exception 'availability.price_override still has values; not dropping the column';
  end if;
end $$;

alter table public.availability drop column if exists price_override;
