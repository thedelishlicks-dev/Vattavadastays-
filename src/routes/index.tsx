import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { Availability } from "@/components/Availability";
import { Rooms } from "@/components/Rooms";
import { RoomDetail, type BookingDetails } from "@/components/RoomDetail";
import { BookingForm } from "@/components/BookingForm";
import { About } from "@/components/About";
import { Amenities } from "@/components/Amenities";
import { MapSection } from "@/components/MapSection";
import { SeoTags } from "@/components/SeoTags";
import { Footer } from "@/components/Footer";
import { useProperty } from "@/hooks/useProperty";
import { getSubdomain } from "@/lib/subdomain";
import LandingPage from "@/components/LandingPage";
import type { Room } from "@/types/database";

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
    return <LandingPage />;
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
  const [openRoom, setOpenRoom] = useState<Room | null>(null);

  // Multi-room cart: list of confirmed room selections
  const [selections, setSelections] = useState<BookingDetails[]>([]);

  const handleRoomConfirm = (details: BookingDetails) => {
    setSelections((prev) => {
      // Replace if same room is already in cart, otherwise append
      const exists = prev.findIndex((s) => s.room.id === details.room.id);
      if (exists >= 0) {
        const next = [...prev];
        next[exists] = details;
        return next;
      }
      return [...prev, details];
    });
    setOpenRoom(null);
    // Scroll to booking form after a tick
    setTimeout(() => {
      document.getElementById("booking")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  const handleRemoveRoom = (roomId: string) => {
    setSelections((prev) => prev.filter((s) => s.room.id !== roomId));
  };

  // When dates change, clear the cart — room prices may differ
  const handleSetCheckIn = (d: Date | null) => {
    setCheckIn(d);
    setSelections([]);
  };
  const handleSetCheckOut = (d: Date | null) => {
    setCheckOut(d);
    setSelections([]);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <SeoTags subdomain={subdomain} />
        <div className="text-sm text-muted-foreground animate-pulse">Loading…</div>
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
    <div className="min-h-screen bg-background">
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
          setCheckIn={handleSetCheckIn}
          setCheckOut={handleSetCheckOut}
        />
        <Rooms
          onSelect={setOpenRoom}
          checkIn={checkIn}
          checkOut={checkOut}
          selectedRoomIds={selections.map((s) => s.room.id)}
        />
        <BookingForm
          selections={selections}
          onRemoveRoom={handleRemoveRoom}
          subdomain={subdomain}
        />
        <About property={property} />
        <Amenities property={property} />
        <MapSection subdomain={subdomain} />
      </main>
      <Footer subdomain={subdomain} />
      {openRoom && (
        <RoomDetail
          room={openRoom}
          checkIn={checkIn}
          checkOut={checkOut}
          onClose={() => setOpenRoom(null)}
          onConfirm={handleRoomConfirm}
        />
      )}
    </div>
  );
}
