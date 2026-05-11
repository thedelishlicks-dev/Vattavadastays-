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
import { Footer } from "@/components/Footer";
import type { Room } from "@/types/database";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Bleaf Mud House · 12-room Mountain Retreat in Vattavada, Kerala" },
      {
        name: "description",
        content:
          "Book Bleaf Mud House — a 12-room organic mountain retreat in Upper Vattavada, Munnar. Deluxe, Family, Standard rooms & dormitory from ₹800/night.",
      },
      { property: "og:title", content: "Bleaf Mud House · Vattavada Mountain Retreat" },
      {
        property: "og:description",
        content: "12-room mountain retreat in organic Vattavada. Hosted by Deepak.",
      },
    ],
  }),
});

function Index() {
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [openRoom, setOpenRoom] = useState<Room | null>(null);
  const [selection, setSelection] = useState<BookingDetails | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Hero />
        <Availability
          checkIn={checkIn}
          checkOut={checkOut}
          setCheckIn={setCheckIn}
          setCheckOut={setCheckOut}
        />
        <Rooms onSelect={setOpenRoom} />
        <BookingForm selection={selection} />
        <About />
        <Amenities />
      </main>
      <Footer />
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
