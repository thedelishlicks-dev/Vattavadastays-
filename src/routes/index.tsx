import { lazy, Suspense, useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { Availability } from "@/components/Availability";
import { Rooms } from "@/components/Rooms";
import { CartBar } from "@/components/CartBar";
import { BookingForm } from "@/components/BookingForm";
import { About } from "@/components/About";
import { Amenities } from "@/components/Amenities";
import { MapSection } from "@/components/MapSection";
import { SeoTags } from "@/components/SeoTags";
import { Footer } from "@/components/Footer";
import { useProperty } from "@/hooks/useProperty";
import { useRoomRates } from "@/hooks/useRoomRates";
import { useUnavailableRoomIds } from "@/hooks/useUnavailableRoomIds";
import { getSubdomain } from "@/lib/subdomain";
import { allocateGuests, suggestRooms, extraGuestsIn, isFullyPlaced, partySize, type Party } from "@/lib/partyAllocation";
import { buildBookingDetails, type BookingDetails } from "@/lib/roomSelection";
import type { Room } from "@/types/database";

// Lazy: guests on a property page never download the marketing landing page.
const LandingPage = lazy(() => import("@/components/LandingPage"));

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const hostname = window.location.hostname;

  const params = new URLSearchParams(window.location.search);
  const slugParam = params.get("slug");
  if (slugParam) {
    return <GuestPage subdomain={slugParam} />;
  }

  const isRootDomain =
    hostname === "stayidom.in" ||
    hostname === "www.stayidom.in" ||
    hostname.endsWith(".vercel.app") ||
    hostname === "localhost" ||
    hostname === "127.0.0.1";

  if (isRootDomain) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <LandingPage />
      </Suspense>
    );
  }

  const subdomain = getSubdomain();
  return <GuestPage subdomain={subdomain} />;
}

function GuestPage({ subdomain }: { subdomain: string }) {
  const { data: property, isLoading } = useProperty(subdomain);

  useEffect(() => {
    if (property?.name) {
      document.title = `${property.name} — Book Direct`;
    }
  }, [property?.name]);

  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  // Everyone who is coming (step 1). Rooms are chosen in step 2 and the guests are shared out
  // over them automatically; `pinned` holds rooms whose guests the guest set by hand.
  const [party, setParty] = useState<Party>({ adults: 2, children: 0 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pinned, setPinned] = useState<Record<string, Party>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [justBooked, setJustBooked] = useState(false);

  const { data: rates } = useRoomRates(property?.id);
  const checkInStr = checkIn ? format(checkIn, "yyyy-MM-dd") : null;
  const checkOutStr = checkOut ? format(checkOut, "yyyy-MM-dd") : null;
  const hasDates = !!checkIn && !!checkOut;
  const { unavailable, settled } = useUnavailableRoomIds(property, checkInStr, checkOutStr);

  const activeRooms = useMemo<Room[]>(() => (property?.rooms ?? []).filter((r: Room) => r.is_active), [property]);
  // With dates chosen only the free rooms are offered.
  const visibleRooms = useMemo(() => (hasDates ? activeRooms.filter((r) => !unavailable.has(r.id)) : activeRooms), [activeRooms, unavailable, hasDates]);
  const selectedRooms = useMemo(() => selectedIds.map((id) => activeRooms.find((r) => r.id === id)).filter((r): r is Room => !!r), [selectedIds, activeRooms]);

  const allocation = useMemo(() => allocateGuests(selectedRooms, party, pinned), [selectedRooms, party, pinned]);
  const selections = useMemo<BookingDetails[]>(
    () => (checkIn && checkOut ? selectedRooms.map((r) => buildBookingDetails(r, allocation.byRoom[r.id], checkIn, checkOut, rates)) : []),
    [selectedRooms, allocation, checkIn, checkOut, rates],
  );
  const suggestion = useMemo(() => (hasDates && settled ? suggestRooms(visibleRooms, party) : []), [hasDates, settled, visibleRooms, party]);

  const guests = partySize(party);
  const unplaced = allocation.unplacedAdults + allocation.unplacedChildren;
  const selectedFit = selectedRooms.length > 0 && isFullyPlaced(allocation) && extraGuestsIn(selectedRooms, allocation) === 0;
  const problem =
    selectedRooms.length === 0 ? null
    : allocation.roomsWithoutAdult.length > 0 ? "Each room needs at least one adult."
    : unplaced > 0 ? `${unplaced} guest${unplaced > 1 ? "s" : ""} still need${unplaced > 1 ? "" : "s"} a room.`
    : null;
  const grandTotal = selections.reduce((sum, s) => sum + s.total, 0);
  const placedGuests = selections.reduce((sum, s) => sum + s.adults + s.children, 0);

  // A date change keeps the chosen rooms and re-prices them; only rooms that are no longer free
  // are dropped (once the answer for the new dates is in), and the guest is told.
  useEffect(() => {
    if (!hasDates || !settled) return;
    const gone = selectedRooms.filter((r) => unavailable.has(r.id));
    if (gone.length === 0) return;
    setSelectedIds((prev) => prev.filter((id) => !unavailable.has(id)));
    setNotice(`${gone.map((r) => r.name).join(", ")} ${gone.length > 1 ? "are" : "is"} not free for these dates and ${gone.length > 1 ? "were" : "was"} removed.`);
  }, [hasDates, settled, unavailable, selectedRooms]);

  const handlePartyChange = (p: Party) => {
    setParty(p);
    setPinned({});
  };
  const handleToggleRoom = (room: Room) => {
    setNotice(null);
    setSelectedIds((prev) => (prev.includes(room.id) ? prev.filter((id) => id !== room.id) : [...prev, room.id]));
    setPinned((prev) => {
      if (!prev[room.id]) return prev;
      const next = { ...prev };
      delete next[room.id];
      return next;
    });
  };
  const handleRemoveRoom = (roomId: string) => {
    setSelectedIds((prev) => prev.filter((id) => id !== roomId));
    setPinned((prev) => {
      const next = { ...prev };
      delete next[roomId];
      return next;
    });
  };
  const handleUseSuggestion = () => {
    setNotice(null);
    setSelectedIds(suggestion);
    setPinned({});
  };
  const goToForm = () => document.getElementById("booking")?.scrollIntoView({ behavior: "smooth" });

  if (isLoading) {
    return (
      <div className="animate-in fade-in duration-300 min-h-screen bg-background">
        <SeoTags subdomain={subdomain} />

        {/* Header skeleton */}
        <div className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
              <div className="h-4 w-28 rounded-md bg-muted animate-pulse" />
            </div>
            <div className="hidden md:flex gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-4 w-16 rounded-md bg-muted animate-pulse" />
              ))}
            </div>
          </div>
        </div>

        {/* Hero skeleton */}
        <div className="relative flex h-[88vh] min-h-[560px] w-full flex-col items-center justify-center gap-4 bg-muted/60 overflow-hidden">
          <div className="h-24 w-24 rounded-full bg-muted animate-pulse md:h-32 md:w-32" />
          <div className="h-7 w-56 rounded-md bg-muted animate-pulse" />
          <div className="h-4 w-40 rounded-md bg-muted animate-pulse" />
        </div>

        {/* Content section skeletons */}
        <div className="mx-auto max-w-6xl space-y-16 px-4 py-16">
          <div className="space-y-4">
            <div className="mx-auto h-6 w-48 rounded-md bg-muted animate-pulse" />
            <div className="h-64 rounded-2xl bg-muted animate-pulse" />
          </div>
          <div className="space-y-4">
            <div className="mx-auto h-6 w-32 rounded-md bg-muted animate-pulse" />
            <div className="grid gap-4 md:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-72 rounded-2xl bg-muted animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoading && (!property || !property.rooms || property.rooms.length === 0)) {
    return (
      <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-6 text-center text-white">
        <SeoTags subdomain={subdomain} />
        <div className="space-y-4 max-w-md">
          <h1 className="font-display text-2xl font-bold italic tracking-tight opacity-50">
            {property?.name ?? "Stayidom"}
          </h1>
          <p className="text-xl font-medium text-white/90 leading-relaxed">
            This property is not yet available for booking.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      key="site-content"
      className="animate-in fade-in slide-in-from-bottom-1 duration-[var(--duration-lazy)] [--tw-ease:var(--ease-lazy)] min-h-screen bg-background"
    >
      {subdomain === "demo" && (
        <div style={{ background: "#fef3c7", borderBottom: "1px solid #fcd34d", color: "#92400e", textAlign: "center", fontSize: "13px", padding: "8px 16px" }}>
          You're viewing a demo — no real booking will be made.
        </div>
      )}
      <SeoTags subdomain={subdomain} />
      <Header />
      <main>
        <Hero />
        <Availability
          checkIn={checkIn}
          checkOut={checkOut}
          setCheckIn={setCheckIn}
          setCheckOut={setCheckOut}
          party={party}
          onPartyChange={handlePartyChange}
        />
        <Rooms
          rooms={visibleRooms}
          hiddenCount={activeRooms.length - visibleRooms.length}
          settled={settled}
          checkIn={checkIn}
          checkOut={checkOut}
          guests={guests}
          selectedRoomIds={selectedIds}
          onToggle={handleToggleRoom}
          rates={rates}
          propertyAmenities={property?.shared_amenities}
          suggestion={suggestion}
          suggestionNeeded={!selectedFit}
          noRoomsForGroup={suggestion.length === 0 && visibleRooms.length > 0}
          onUseSuggestion={handleUseSuggestion}
          notice={notice}
          onDismissNotice={() => setNotice(null)}
        />
        <BookingForm
          selections={selections}
          onRemoveRoom={handleRemoveRoom}
          party={party}
          onAdjustRoom={(roomId, p) => setPinned((prev) => ({ ...prev, [roomId]: p }))}
          hasManualSplit={Object.keys(pinned).length > 0}
          onResetSplit={() => setPinned({})}
          problem={problem}
          onJustBookedChange={setJustBooked}
          subdomain={subdomain}
        />
        <About property={property} />
        <Amenities property={property} />
        <MapSection subdomain={subdomain} />
      </main>
      <Footer subdomain={subdomain} />
      {!justBooked && (
        <CartBar
          rooms={selections.length}
          guestsText={`${placedGuests} of ${guests} guest${guests > 1 ? "s" : ""} placed`}
          warning={problem}
          total={grandTotal}
          onContinue={goToForm}
        />
      )}
    </div>
  );
}
