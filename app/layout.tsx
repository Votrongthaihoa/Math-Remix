import type { Metadata } from "next";
import "./globals.css";
import "./ui-system.css";

export const metadata: Metadata = {
  title: "REMIX Education",
  description: "Không gian học tập trực tuyến dành cho học viên REMIX.",
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
