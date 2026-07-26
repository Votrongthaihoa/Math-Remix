# Phòng khảo thí — khảo sát và kế hoạch triển khai

Ngày khảo sát: 26/07/2026. Trang tham chiếu: `https://tsa.aeck.edu.vn/exam-rooms/tsa`.

## Tài nguyên frontend quan sát được

- JavaScript nền: `index-Bm2V08BA.js`, `rolldown-runtime-Bhmf7a9N.js`, `vendor-react-xAF6D3by.js`, `vendor-antd-BnS1jlWh.js`, `vendor-misc-8LRQ-qLV.js`.
- JavaScript theo route: `ExamRoomDashboard-B_aiC1xK.js`, `AssessmentListPage-CUIWWUSR.js`, `AssessmentInfoPage-Cx15rVbt.js`, `ExamTestPage-CjQKSAF-.js`, `ExamTestPage-Cm85FXRB.js`, `ExamResultPage-CSpclet2.js`, `ExamConfirmInfo-CCa6WXnT.js`, `GroupResultDetailPage-Cg3X-45f.js`.
- Service chunks: `AssessmentService-C9Wdp4eF.js`, `ExamRoomService-Yxa7Lh2D.js`, `ExamService-ChRtXh7F.js`, `TestService-DTKuzS0z.js`, `UserExamProgressService-BgBxMaiD.js`, `examDraftSync-DampVFp7.js`.
- Công thức: `MathRendererContent-BUvj--77.js` gọi KaTeX `renderToString` với chế độ inline/display và fallback khi công thức lỗi.
- CSS: `index-CsxrzKOn.css`, `vendor-react-Qt5BCU-z.css`, `vendor-misc-B55ho58D.css`. CSS vendor chứa `.katex` cùng 20 nhóm `@font-face` KaTeX.
- Font chữ giao diện: Lato Regular, Medium, Bold, Italic. Font toán: KaTeX AMS, Caligraphic, Fraktur, Main, Math, SansSerif, Script, Size1–4 và Typewriter.
- Hình ảnh: `trongdong-NMTKxtZs.svg`, `logo-full-CZEctxpK.svg`, `bg-page-login-BnQ2RPph.png`; ngoài ra có 13 SVG inline ở danh sách phòng thi.
- Không có video trên các trạng thái đã khảo sát.

Các URL `.map` tương ứng trả HTML của SPA thay vì nội dung source map JSON; không phát hiện source map công khai dùng được.

## Route và API quan sát được

Route:

- `/exam-rooms/:type`
- `/assessment-list/:examRoomId`
- `/assessment/:assessmentId?examRoomId=...&mode=single`
- `/exam/test/...`
- `/exam/result/:assessmentId`

XHR/fetch quan sát được (chỉ ghi endpoint, không thu thập header xác thực, cookie hoặc token):

- `GET /api/v2/exam-room?page=1&limit=12&type=TSA`
- `GET /api/v2/assessment/exam-room/:examRoomId`
- `GET /api/v2/assessment/:assessmentId?examRoomId=:examRoomId`
- `GET /api/v2/exam-result/by-assessmentids`
- `GET /api/v2/exam-progress/:key`
- Ghi tiến độ qua `/api/v2/exam-progress`

## Kích thước và breakpoint đo được

- Font giao diện: Lato; màu chính `#cd1627`; màu chữ chính `#111827`; nền thẻ trắng; border `#e5e7eb`.
- Desktop 1440 px: sidebar 80 px; header 73 px; main margin-left 80 px, padding 48 px; lưới thẻ hai cột.
- Tablet khoảng 794 px: sidebar 80 px; main padding 24 px; thẻ phòng thi một cột.
- Mobile 390 px: sidebar drawer rộng 256 px và ẩn ngoài màn hình; header 65 px; main padding 16 px; thẻ rộng toàn màn hình.
- Thẻ phòng thi: radius 12 px, border 1 px, shadow mức vừa; nút chính cao 36 px, radius 8 px.
- Modal chọn chế độ mobile: nền phủ `rgba(0,0,0,.6)`, panel radius 16 px, padding 24 px.

## Cấu trúc component mới

- `ExamRoomModule`: điều phối route phía client.
- `ExamRoomCatalog`: danh sách phòng thi và tiến độ.
- `ExamList`: danh sách đề, lượt đang làm và kết quả gần nhất.
- `ModeDialog`: chọn Luyện tập hoặc Thực chiến.
- `ExamRunner`: timer, câu hỏi, đáp án, điều hướng và nộp bài.
- `QuestionPalette`: bảng câu hỏi desktop; drawer trên mobile.
- `MathContent`: KaTeX an toàn (`trust: false`) cho công thức inline/display.
- `ExamResult`: điểm tổng, kết quả từng phần và xem lại lời giải.
- `/api/exams`: xác thực Supabase, lọc quyền, khởi tạo lượt thi, chấm và trả kết quả.

## Thiết kế responsive triển khai

- Desktop: nội dung câu hỏi và palette hai cột, header/timer sticky.
- Tablet: palette thu hẹp, thẻ phòng/đề chuyển từ hai cột xuống một cột.
- Mobile: palette thành drawer; nút Câu trước/Câu tiếp/Nộp bài bám đáy; công thức cho phép cuộn ngang bên trong thay vì làm tràn trang; modal kết quả chiếm toàn màn hình.
- Breakpoint chính: 1199, 991, 767, 575 và 370 px.

## Dữ liệu

Không dùng dữ liệu ảo. Migration `006_exam_room_module.sql` tạo phòng thi, đề, phần, câu hỏi, bảng đáp án tách riêng và phân quyền RLS. Đáp án đúng không được gửi xuống khi học viên đang làm bài; chấm điểm diễn ra ở API phía máy chủ.
