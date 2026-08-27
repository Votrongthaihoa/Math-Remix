import { useMemo, useState } from "react";
import { BookOpen, CalendarDays, Search } from "lucide-react";
import { Link } from "react-router-dom";

const searchableItems = [
  { title: "Luyện thi TSA 2026", type: "Khóa học", path: "/courses", icon: BookOpen },
  { title: "Phòng thi thử TSA", type: "Phòng luyện", path: "/exam-room", icon: BookOpen },
  { title: "Thời khóa biểu", type: "Lịch học", path: "/tkb", icon: CalendarDays },
];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    if (!normalized) return searchableItems;
    return searchableItems.filter((item) => `${item.title} ${item.type}`.toLocaleLowerCase("vi").includes(normalized));
  }, [query]);

  return (
    <div className="aeck-page-stack">
      <header className="aeck-page-heading"><h1>Tra cứu</h1><p>Tìm nhanh khóa học, phòng luyện và lịch học.</p></header>
      <label className="aeck-search-box" htmlFor="platform-search">
        <Search aria-hidden="true" />
        <span className="aeck-sr-only">Từ khóa tra cứu</span>
        <input id="platform-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập nội dung cần tìm…" autoComplete="off" />
      </label>
      <p className="aeck-result-status" role="status" aria-live="polite">{results.length} kết quả</p>
      <div className="aeck-search-results">
        {results.map((item) => {
          const Icon = item.icon;
          return <Link key={item.title} to={item.path}><Icon aria-hidden="true" /><span><strong>{item.title}</strong><small>{item.type}</small></span></Link>;
        })}
        {!results.length ? <p className="aeck-empty-state">Không tìm thấy nội dung phù hợp. Hãy thử từ khóa ngắn hơn.</p> : null}
      </div>
    </div>
  );
}
