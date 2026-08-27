import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CalendarDays, ExternalLink, MapPin, Video } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { timetableQuery } from "../../api/platform-api.ts";
import { LoadingPanel } from "../../components/ui/loading-panel.tsx";
import { QueryError } from "../../components/ui/query-error.tsx";
import { legacyUrl } from "../parity/legacy-url.ts";
import { groupTimetableByDay } from "./timetable-utils.ts";
import "../../styles/student-modules.css";
import "../../styles/timetable.css";

const time = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });

export default function TimetablePage() {
  const query = useQuery(timetableQuery);
  const groups = useMemo(() => groupTimetableByDay(query.data ?? []), [query.data]);
  if (query.isPending) return <LoadingPanel label="Đang tải thời khóa biểu…" />;
  if (query.isError) return <QueryError message={query.error.message} retry={() => void query.refetch()} />;
  return <div className="aeck-student-module aeck-timetable-page"><header className="aeck-student-page-heading"><div><h1>Thời khóa biểu</h1><p>Lịch học và lịch luyện tập gần nhất của bạn.</p></div><Link className="aeck-button-secondary" to="/exam-rooms/all"><CalendarDays aria-hidden="true" />Xem phòng luyện</Link></header><div className="aeck-timetable-groups">{groups.map((group) => <section key={group.key}><header><CalendarClock aria-hidden="true" /><h2>{group.label}</h2><span>{group.entries.length} buổi</span></header><div>{group.entries.map((entry) => <article key={entry.id}><time dateTime={entry.startsAt}>{time.format(new Date(entry.startsAt))}<small>{time.format(new Date(entry.endsAt))}</small></time><div><span>{entry.mode === "online" ? "Trực tuyến" : entry.mode === "exam" ? "Khảo thí" : "Tại lớp"}</span><h3>{entry.title}</h3><p><MapPin aria-hidden="true" />{entry.location}{entry.instructor ? ` · ${entry.instructor}` : ""}</p></div>{entry.joinUrl ? <a href={entry.joinUrl}><Video aria-hidden="true" />Tham gia</a> : <a href={legacyUrl(`/exam-room/${entry.id}`)}><ExternalLink aria-hidden="true" />Chi tiết</a>}</article>)}</div></section>)}{!groups.length ? <div className="aeck-student-empty"><CalendarClock aria-hidden="true" /><h2>Chưa có lịch bổ sung</h2><p>Lịch mới sẽ xuất hiện sau khi được xác nhận.</p></div> : null}</div></div>;
}
