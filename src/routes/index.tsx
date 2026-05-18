import { useState } from "react";
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
import type { Room } from "@/types/database";

function getSubdomain(): string {
  const hostname = window.location.hostname;
  if (hostname.endsWith(".vattavadastays.com")) return hostname.split(".")[0];
  return import.meta.env.VITE_PROPERTY_SUBDOMAIN ?? "bleafmudhouse";
}

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const subdomain = getSubdomain();
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [openRoom, setOpenRoom] = useState<Room | null>(null);
  const [selection, setSelection] = useState<BookingDetails | null>(null);

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
        <Rooms
          onSelect={setOpenRoom}
          checkIn={checkIn}
          checkOut={checkOut}
        />
        <BookingForm selection={selection} subdomain={subdomain} />
        <About />
        <Amenities />
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
              document.getElementById("booking")?.scrollIntoView({ behavior: "smooth" });
            }, 50);
          }}
        />
      )}
    </div>
  );
}
