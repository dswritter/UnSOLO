-- Hard guarantee against overbooking a package departure date.
--
-- The app checks availability (sum of guests vs max_group_size) before creating a
-- booking, but that read-then-insert is NOT atomic: two concurrent checkouts can
-- both pass the check and oversell the last seats. This trigger closes that race
-- at the database level. It serializes seat checks per (package, travel_date) with
-- a transaction-scoped advisory lock and rejects any insert/update that would push
-- the confirmed/pending/completed guest count past max_group_size.
--
-- Only package trips are capped here (service listings manage their own stock).

create or replace function public.enforce_package_capacity()
returns trigger
language plpgsql
as $$
declare
  v_max    integer;
  v_booked integer;
begin
  -- Only package bookings occupy this capped pool, and only seat-holding statuses
  -- consume a seat.
  if new.package_id is null then
    return new;
  end if;
  if new.status not in ('pending', 'confirmed', 'completed') then
    return new;
  end if;

  select max_group_size into v_max
  from public.packages
  where id = new.package_id;

  -- No cap configured -> nothing to enforce.
  if v_max is null or v_max <= 0 then
    return new;
  end if;

  -- Serialize concurrent seat checks for this departure so two transactions can't
  -- both read a stale count and oversell. Transaction-scoped: released on commit.
  perform pg_advisory_xact_lock(
    hashtext(new.package_id::text || '|' || coalesce(new.travel_date::text, ''))
  );

  select coalesce(sum(guests), 0) into v_booked
  from public.bookings
  where package_id = new.package_id
    and coalesce(travel_date, date '1970-01-01') = coalesce(new.travel_date, date '1970-01-01')
    and status in ('pending', 'confirmed', 'completed')
    and id <> new.id;

  if v_booked + coalesce(new.guests, 1) > v_max then
    raise exception 'PACKAGE_CAPACITY_EXCEEDED: % seat(s) remain for this date', greatest(v_max - v_booked, 0)
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_package_capacity on public.bookings;
create trigger trg_enforce_package_capacity
  before insert or update of status, guests, travel_date, package_id
  on public.bookings
  for each row
  execute function public.enforce_package_capacity();
