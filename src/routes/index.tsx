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

  // Check hostname directly — do NOT rely on getSubdomain() here because
  // stayidom.in does not end with .stayidom.in, so getSubdomain() falls
  // through to the VITE_PROPERTY_SUBDOMAIN env var and returns a property
  // slug instead of indicating root domain.
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
  const [selection, setSelection] = useState<BookingDetails | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <SeoTags subdomain={subdomain} />
        <div className="text-sm text-muted-foreground animate-pulse">
          Loading…
        </div>
      </div>
    );
  }

  if (
    !isLoading &&
    (!property || !property.rooms || property.rooms.length === 0)
  ) {
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
      <SeoTags subdomain={subdomain} />
      <Header />
      <main>
        <Hero />
        <Availability
          checkIn={checkIn}
          checkOut={checkOut}
          setCheckIn={setCheckIn}
          setCheckOut={setCheckOut}
        />
        <Rooms onSelect={setOpenRoom} checkIn={checkIn} checkOut={checkOut} />
        <BookingForm selection={selection} subdomain={subdomain} />
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
          onConfirm={(details) => {
            setSelection(details);
            setOpenRoom(null);
            setTimeout(() => {
              document.getElementById("booking")?.scrollIntoView({
                behavior: "smooth",
              });
            }, 50);
          }}
        />
      )}
    </div>
  );
}
