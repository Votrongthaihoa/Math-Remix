import { CalendarClock, MapPin, Video } from "lucide-react";

const schedule = [
  { day: "Thứ hai", time: "19:30–21:00", title: "Luyện tư duy định lượng", location: "Phòng trực tuyến TSA" },
  { day: "Thứ tư", time: "19:30–21:00", title: "Chuyên đề đọc hiểu", location: "Phòng trực tuyến TSA" },
  { day: "Thứ bảy", time: "08:00–09:30", title: "Thi thử và chữa đề", location: "Phòng khảo thí 01" },
];

export default function TimetablePage() {
  return (
    <div className="aeck-page-stack">
      <header className="aeck-page-heading"><h1>Thời khóa biểu</h1><p>Lịch học và lịch luyện tập gần nhất của bạn.</p></header>
      <div className="aeck-timetable-grid">
        {schedule.map((entry) => (
          <article key={`${entry.day}-${entry.time}`} className="aeck-timetable-card">
            <header><span>{entry.day}</span><strong>{entry.time}</strong></header>
            <h2>{entry.title}</h2>
            <p><MapPin aria-hidden="true" />{entry.location}</p>
            <button type="button"><Video aria-hidden="true" />Xem thông tin buổi học</button>
          </article>
        ))}
        <article className="aeck-timetable-card aeck-timetable-empty">
          <CalendarClock aria-hidden="true" />
          <h2>Chưa có lịch bổ sung</h2>
          <p>Lịch mới sẽ xuất hiện tại đây sau khi được giáo viên xác nhận.</p>
        </article>
      </div>
    </div>
  );
}
