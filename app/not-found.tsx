import type { Metadata } from "next";
import Link from "next/link";
import NotFoundCanvas from "./not-found-canvas";

export const metadata: Metadata = { title: "404 | REMIX Education" };

export default function NotFoundPage() {
  return <main className="not-found-page">
    <NotFoundCanvas />
    <section className="not-found-message">
      <span>404 · NOT FOUND</span>
      <h1>Bạn không nên ở đây.</h1>
      <p>Trang bạn tìm kiếm không tồn tại hoặc đã được chuyển đi.</p>
      <Link href="/dashboard">Quay về trang chính</Link>
    </section>
  </main>;
}
