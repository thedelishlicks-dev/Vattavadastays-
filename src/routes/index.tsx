import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { About } from "@/components/About";
import { Amenities } from "@/components/Amenities";
import { Gallery } from "@/components/Gallery";
import { Booking } from "@/components/Booking";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Bleaf Mud House · Organic Farm Stay in Vattavada, Kerala" },
      {
        name: "description",
        content:
          "Book Bleaf Mud House — a 2-bedroom organic farm stay in Upper Vattavada, Munnar. Strawberry farms, plantation walks, bonfire nights. ₹2000/night.",
      },
      { property: "og:title", content: "Bleaf Mud House · Vattavada Farm Stay" },
      {
        property: "og:description",
        content: "Organic farm stay in the Western Ghats. Hosted by Deepak.",
      },
    ],
  }),
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Hero />
        <About />
        <Amenities />
        <Gallery />
        <Booking />
      </main>
      <Footer />
    </div>
  );
}
