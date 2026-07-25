import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "REMIX Education",
  description: "Không gian học tập trực tuyến dành cho học viên REMIX.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
