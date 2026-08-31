import type { Metadata } from "next";
import "./globals.css";
import "./ui-system.css";

export const metadata: Metadata = {
  title: "AECK",
  description: "Không gian học tập, khảo thí và quản trị trực tuyến của AECK.",
  icons: {
    icon: [
      { url: "/logo192.png", sizes: "192x192", type: "image/png" },
      { url: "/logo512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/logo192.png", sizes: "192x192", type: "image/png" },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
