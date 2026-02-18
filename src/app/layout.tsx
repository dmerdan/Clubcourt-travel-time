import type { Metadata } from "next";
import "@/app/globals.css";
import "leaflet/dist/leaflet.css";

export const metadata: Metadata = {
  title: "Travel Time Matrix MVP",
  description: "Distance and real-time travel time between a target location and editable landmarks."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
