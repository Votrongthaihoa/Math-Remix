import type { Metadata } from "next";
import AeckPublicSite from "./aeck-public-site";

export const metadata: Metadata = {
  title: "AECK - Luyện thi TSA, HSA & Đánh giá năng lực trực tuyến",
  description: "Hệ thống học và luyện thi TSA, HSA với khóa học, phòng luyện và nội dung bám sát cấu trúc kỳ thi.",
};

export default function Home() {
  return <AeckPublicSite />;
}
