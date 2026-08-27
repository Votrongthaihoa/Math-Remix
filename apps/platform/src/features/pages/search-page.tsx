import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarDays, ClipboardCheck, Search, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { platformCollectionQuery } from "../../api/platform-api.ts";
import { normalizedSearchText } from "../collections/collection-utils.ts";

const resources = ["courses", "exam-rooms", "attempts", "progress"] as const;
const resourceMeta = {
  courses: { label: "Khóa học", icon: BookOpen, path: "/courses" },
  "exam-rooms": { label: "Phòng khảo thí", icon: BookOpen, path: "/exam-rooms/all" },
  attempts: { label: "Lịch sử thi", icon: ClipboardCheck, path: "/exam-history" },
  progress: { label: "Tiến độ", icon: TrendingUp, path: "/progress" },
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const courseQuery = useQuery(platformCollectionQuery(resources[0]));
  const roomQuery = useQuery(platformCollectionQuery(resources[1]));
  const attemptQuery = useQuery(platformCollectionQuery(resources[2]));
  const progressQuery = useQuery(platformCollectionQuery(resources[3]));
  const loading = [courseQuery, roomQuery, attemptQuery, progressQuery].some((item) => item.isPending);
  const results = useMemo(() => {
    const collections = [
      courseQuery.data,
      roomQuery.data,
      attemptQuery.data,
      progressQuery.data,
    ];
    const needle = normalizedSearchText(query.trim());
    return collections.flatMap((collection) => collection?.records.map((record) => ({ record, resource: collection.resource })) ?? []).filter(({ record }) => !needle || normalizedSearchText(`${record.title} ${record.description} ${record.category} ${record.tags.join(" ")}`).includes(needle));
  }, [attemptQuery.data, courseQuery.data, progressQuery.data, query, roomQuery.data]);
  return <div className="aeck-page-stack"><header className="aeck-page-heading"><h1>Tra cứu</h1><p>Tìm nhanh khóa học, phòng luyện, lịch sử và tiến độ học tập.</p></header><label className="aeck-search-box" htmlFor="platform-search"><Search aria-hidden="true" /><span className="aeck-sr-only">Từ khóa tra cứu</span><input id="platform-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập nội dung cần tìm…" autoComplete="off" /></label><p className="aeck-result-status" role="status" aria-live="polite">{loading ? "Đang tìm…" : `${results.length} kết quả`}</p><div className="aeck-search-results">{results.slice(0, 30).map(({ record, resource }) => { const meta = resourceMeta[resource as keyof typeof resourceMeta]; const Icon = meta.icon; return <Link key={`${resource}-${record.id}`} to={meta.path}><Icon aria-hidden="true" /><span><strong>{record.title}</strong><small>{meta.label}{record.category ? ` · ${record.category}` : ""}</small></span></Link>; })}{!loading && !results.length ? <p className="aeck-empty-state">Không tìm thấy nội dung phù hợp. Hãy thử từ khóa ngắn hơn.</p> : null}<Link to="/tkb"><CalendarDays aria-hidden="true" /><span><strong>Thời khóa biểu</strong><small>Lịch học</small></span></Link></div></div>;
}
