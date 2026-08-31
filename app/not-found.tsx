import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "404 | AECK" };

export default function NotFoundPage() {
  return <main className="not-found-page">
    <iframe className="not-found-canvas" src="/404-eyes.html" title="Hiệu ứng những con mắt" tabIndex={-1} aria-hidden="true" sandbox="allow-scripts" />
    <section className="not-found-message" aria-labelledby="not-found-title" aria-describedby="not-found-description">
      <span>404 · NOT FOUND</span>
      <h1 id="not-found-title">Bạn không nên ở đây.</h1>
      <p id="not-found-description">Trang bạn tìm kiếm không tồn tại hoặc đã được chuyển đi.</p>
      <Link href="/dashboard">Quay về trang chính</Link>
    </section>
  </main>;
}
