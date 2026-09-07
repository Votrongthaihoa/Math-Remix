import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("exam-room catalog ports the supplied room-card anatomy without invented filters", async () => {
  const source = await readFile(new URL("../app/exam-room.tsx", import.meta.url), "utf8");
  const catalog = source.slice(source.indexOf("function ExamRoomCatalog"), source.indexOf("function ExamList"));

  assert.match(catalog, /Chọn phòng thi để bắt đầu làm bài/);
  assert.match(catalog, /label="Đăng ký"/);
  assert.match(catalog, /label="Thời gian thi"/);
  assert.match(catalog, /label="Số lượng bài thi"/);
  assert.match(catalog, /label="Số lượng đề thi"/);
  assert.match(catalog, />Hoàn thành</);
  assert.match(catalog, />Bắt đầu</);
  assert.doesNotMatch(catalog, /typeFilter|exam-room-type-filters|exam-type-badge|Cấu trúc|Xem các đề trong gói/);
});

test("exam-room catalog keeps the supplied responsive grid and card geometry", async () => {
  const css = await readFile(new URL("../app/exam-catalog-redesign.css", import.meta.url), "utf8");

  assert.match(css, /\.exam-room-page \.exam-room-grid\s*\{[^}]*grid-template-columns:\s*1fr;[^}]*gap:\s*20px;/s);
  assert.match(css, /@media \(min-width:\s*1024px\)[\s\S]*?\.exam-room-page \.exam-room-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(css, /@media \(min-width:\s*1536px\)[\s\S]*?\.exam-room-page \.exam-room-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(css, /\.exam-room-page \.reference-room-card\s*\{[^}]*border-radius:\s*12px;[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.exam-room-page \.reference-room-card-title\s*\{[^}]*padding:\s*24px 24px 16px;/s);
  assert.match(css, /\.exam-room-page \.reference-room-card-body\s*\{[^}]*padding:\s*16px 24px;/s);
  assert.match(css, /\.exam-room-page \.reference-room-card-footer\s*\{[^}]*padding:\s*16px 24px;/s);
});

test("exam-room detail ports the supplied package header and exam-card anatomy", async () => {
  const source = await readFile(new URL("../app/exam-room.tsx", import.meta.url), "utf8");
  const detail = source.slice(source.indexOf("function ExamList"), source.indexOf("function ExamAttemptHistoryDialog"));

  assert.match(detail, /Chọn bài thi để bắt đầu làm bài/);
  assert.match(detail, /label="Hình thức thi:"/);
  assert.match(detail, /label="Thời gian đăng kí:"/);
  assert.match(detail, /label="Thời gian thi:"/);
  assert.match(detail, /label="Số lượt thi:"/);
  assert.match(detail, /Xem đáp án/);
  assert.match(detail, /"Bắt đầu"/);
  assert.doesNotMatch(detail, /exam-package-search|Tìm kiếm đề thi|reference-paper-label/);
});

test("exam-room detail keeps the supplied header, card and breakpoint geometry", async () => {
  const css = await readFile(new URL("../app/exam-catalog-redesign.css", import.meta.url), "utf8");

  assert.match(css, /\.exam-list-page \.reference-room-detail-header\s*\{[^}]*padding:\s*24px;[^}]*border-radius:\s*16px;/s);
  assert.match(css, /\.exam-list-page \.exam-list-grid\s*\{[^}]*grid-template-columns:\s*1fr;[^}]*gap:\s*24px;/s);
  assert.match(css, /@media \(min-width:\s*1024px\)[\s\S]*?\.exam-list-page \.exam-list-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(css, /@media \(min-width:\s*1536px\)[\s\S]*?\.exam-list-page \.exam-list-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(css, /\.exam-list-page \.reference-exam-card\s*\{[^}]*border-radius:\s*12px(?:\s*!important)?;[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.exam-list-page \.reference-exam-card-head\s*\{[^}]*padding:\s*24px 24px 16px;/s);
  assert.match(css, /\.exam-list-page \.reference-exam-card-body\s*\{[^}]*padding:\s*16px 24px;/s);
  assert.match(css, /\.exam-list-page \.reference-exam-card-footer\s*\{[^}]*padding:\s*16px 24px;/s);
});

test("learner exam summaries expose derived counts without leaking settings", async () => {
  const route = await readFile(new URL("../app/api/exams/route.ts", import.meta.url), "utf8");
  const roomScopes = route.slice(route.indexOf('if (scope === "rooms")'), route.indexOf('if (scope === "exam")'));

  assert.match(roomScopes, /\.from\("exam_sections"\)\.select\("exam_id"\)/);
  assert.match(route, /function publicExamSummary/);
  assert.match(route, /section_count:\s*Math\.max\(0, sectionCount\)/);
  assert.match(route, /max_attempts:\s*policy\.access\.maxAttempts/);
  assert.match(route, /\{\s*settings:\s*_settings,\s*\.\.\.safeExam\s*\}\s*=\s*exam/);
});

test("student timetable ports the supplied TKB bundle contract and fixed palettes", async () => {
  const source = await readFile(new URL("../app/student-discovery.tsx", import.meta.url), "utf8");
  const timetable = source.slice(source.indexOf("export type TimetableFormat"), source.indexOf("export type AdminFinderItem"));

  assert.match(timetable, /type TimetableFormat = "ilearn" \| "zoom" \| "live" \| "video"/);
  assert.match(timetable, /const timetableStartHour = 8/);
  assert.match(timetable, /const timetableEndHour = 24/);
  assert.match(timetable, /const timetableHourHeight = 64/);
  assert.match(timetable, /ilearn:[\s\S]*?background: "#fee2e2"[\s\S]*?border: "#cd1627"[\s\S]*?text: "#9f1239"/);
  assert.match(timetable, /zoom:[\s\S]*?background: "#d6ebf7"[\s\S]*?border: "#0072b2"[\s\S]*?text: "#075985"/);
  assert.match(timetable, /live:[\s\S]*?background: "#fcefd6"[\s\S]*?border: "#e69f00"[\s\S]*?text: "#92400e"/);
  assert.match(timetable, /video:[\s\S]*?background: "#d4f0e7"[\s\S]*?border: "#009e73"[\s\S]*?text: "#065f46"/);
  assert.match(timetable, /Lớp iLearn/);
  assert.match(timetable, /Zoom kín/);
  assert.match(timetable, /Live Page/);
  assert.match(timetable, /label: "Video"/);
});

test("student timetable keeps source interactions, scrolling and truthful empty state", async () => {
  const source = await readFile(new URL("../app/student-discovery.tsx", import.meta.url), "utf8");
  const timetable = source.slice(source.indexOf("export type TimetableFormat"), source.indexOf("export type AdminFinderItem"));

  assert.match(timetable, /document\.body\.style\.overflow = "hidden"/);
  assert.match(timetable, /scrollTop = Math\.max\(0, currentLineTop - 120\)/);
  assert.match(timetable, /weekOffset !== 0 \? "Tuần này" : "Hôm nay"/);
  assert.match(timetable, /Không có lịch học trong tuần này/);
  assert.match(timetable, /Link mở trước giờ học 30 phút/);
  assert.match(timetable, /aria-describedby=\{tooltipId\}/);
  assert.match(timetable, /minWidth: 560/);
  assert.match(timetable, /height: "calc\(100vh - 220px\)"/);
  assert.match(timetable, /minHeight: 400/);
});

test("student timetable uses the exact supplied Ant icon paths", async () => {
  const source = await readFile(new URL("../app/student-discovery.tsx", import.meta.url), "utf8");
  const timetable = source.slice(source.indexOf("export type TimetableFormat"), source.indexOf("export type AdminFinderItem"));

  assert.match(timetable, /M880 184H712v-64c0-4\.4-3\.6-8-8-8h-56/);
  assert.match(timetable, /M724 218\.3V141c0-6\.7-7\.7-10\.4-12\.9-6\.3L260\.3/);
  assert.match(timetable, /M765\.7 486\.8L314\.9 134\.7/);
  assert.match(timetable, /M952 474H829\.8C812\.5 327\.6/);
  assert.match(timetable, /M832 464h-68V240c0-70\.7-57\.3-128-128-128H388/);
  assert.match(timetable, /M912 302\.3L784 376V224c0-35\.3-28\.7-64-64-64H128/);
});
