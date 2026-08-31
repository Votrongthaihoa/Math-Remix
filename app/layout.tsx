import type { Metadata } from "next";
import "./globals.css";
import "./ui-system.css";

export const metadata: Metadata = {
  title: "AECK",
  description: "Không gian học tập, khảo thí và quản trị trực tuyến của AECK.",
  icons: {
    icon: "/logo_aeck.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
