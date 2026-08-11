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

## Khảo sát bổ sung Hethonglab — đủ ba phần TSA

Ngày hoàn tất: 27/07/2026. Ba phần Toán (40 câu), Đọc hiểu (20 câu) và Khoa học (40 câu) đã được duyệt hết trong chế độ luyện tập và nộp sau khi người dùng xác nhận trực tiếp. Mục đích của lượt làm là quan sát đầy đủ các trạng thái giao diện; không dùng response chấm điểm hay dữ liệu ẩn để lấy đáp án.

### Tài nguyên và kỹ thuật quan sát được

- Document: `https://hethonglab.com/bai-thi-tsa/:id`, ứng dụng SPA React.
- Bundle chính: `https://hethonglab.com/assets/index-CvGeGVj1.js`, kích thước phản hồi quan sát khoảng 6.245.209 ký tự.
- Bundle chứa dấu hiệu React, Axios, KaTeX, Lucide, WebSocket và HTML Drag and Drop (`draggable`, `onDragStart`, `onDrop`).
- State/hành vi nhìn thấy trong bundle gồm `timeLeft`, `currentQuestion`, `answered`, `bookmarked`, `isConnected`.
- Không có `sourceMappingURL`; sự kiện `Debugger.scriptParsed` cũng trả source-map URL rỗng. Không tìm thấy source map công khai dùng được.
- Có thông báo giấy phép của một số thư viện bên thứ ba trong bundle, nhưng không xác minh được giấy phép cho mã ứng dụng Hethonglab. Vì vậy không đưa bundle minify, CSS hay ảnh độc quyền của ứng dụng vào source chính; giao diện trong dự án là bản viết lại độc lập từ hành vi quan sát được.

### Route và luồng API quan sát được

- Route: `/bai-thi-tsa/:id`, `/lab/tsa/luyen-de` và các route kết quả.
- Chuỗi endpoint công khai trong bundle: `/begin`, `/next`, `/answer`, `/submit`, `/history`, `/attempts/`, `/exams/`.
- Chỉ ghi lại tên route/endpoint và vai trò giao diện. Không ghi cookie, header `Authorization`, access/refresh token, session ID, mật khẩu, API key hay payload chứa dữ liệu cá nhân.
- Dự án local tiếp tục dùng API Supabase riêng tại `/api/exams`; không gọi API production của Hethonglab.

### Thành phần và kiểu câu hỏi đã xác nhận

- Chọn một đáp án bằng nút tròn tùy biến; chọn nhiều đáp án, gồm chỉ dẫn “Chọn HAI”.
- Ma trận đúng/sai, mỗi phát biểu có hai nút tròn độc lập.
- Điền một ô hoặc nhiều ô nội tuyến.
- Kéo–thả từ ngân hàng đáp án vào các vùng viền nét đứt.
- Sắp xếp thứ tự bằng chuỗi lựa chọn A/B/C/D.
- Công thức KaTeX và hình ảnh có nút xem trước/phóng to.
- Toán dùng bố cục câu hỏi và bảng điều hướng; Đọc hiểu/Khoa học dùng đoạn đọc hoặc dữ liệu bên trái và nhóm câu hỏi cuộn độc lập bên phải.
- Desktop: vùng nội dung và sidebar cố định 480 px; nút tiếp theo xanh navy `#132768`, nút nộp đỏ `#CE1628`, câu đã làm màu xanh và câu đánh dấu màu cam.
- Mobile/tablet: sidebar đổi thành drawer mở bằng nút Menu; thanh điều hướng bám đáy.
- Modal nộp bài hiển thị số câu đã trả lời, cho phép quay lại hoặc xác nhận “Nộp bài thi”.

### Tích hợp độc lập vào dự án

- `ExamLayout`, `ExamHeader`, `ExamTimer`, `QuestionContent`, `AnswerList`, `AnswerOption`, `QuestionNavigator`, `ExamProgress`, `ConfirmSubmitModal`, `ExamResult` được dùng để tách trách nhiệm giao diện.
- Migration `007_exam_question_formats.sql` thêm `inline`, `true_false`, `ordering`, `drag_drop` và các trường `passage`, `media_url`, `instruction`.
- Chấm điểm nhiều lựa chọn không phụ thuộc thứ tự; điền nhiều ô, đúng/sai, sắp xếp và kéo–thả giữ đúng thứ tự vị trí.
- Không có tài nguyên Hethonglab nào được dùng nguyên bản do chưa xác minh được giấy phép ứng dụng. Không có cơ chế bảo vệ nào bị vượt qua và không có đáp án ẩn nào được thu thập.

### Dữ liệu response do người dùng cung cấp

- Nguồn nhập: `C:\Users\LENOVO\Desktop\Trial\Test\Toán.txt`, `Đọc.txt`, `Khoa học.txt`.
- Script `scripts/build-tsa-response-seed.mjs` chuẩn hóa cấu trúc response thành schema nội bộ; reading-comprehension được tách thành đoạn đọc chung và các câu con.
- Kết quả tạo `008_seed_tsa_response_exam.sql`: 3 đề, tổng cộng 100 câu (40 Toán, 20 Đọc hiểu, 40 Khoa học).
- Marker ảnh trong response được hiển thị bằng `RichContent`; URL ảnh giữ nguyên và không tải/copy binary về repository.
- Các response không chứa đáp án đúng. Seed vì vậy chỉ chứa nội dung/phương án hiển thị, không tạo bản ghi `exam_question_keys` giả và không tuyên bố có thể chấm điểm chính xác bộ đề này.

### Audit DOM bổ sung từ 16 snapshot

- 16 bản HTML do người dùng cung cấp được phân tích theo SHA-256; có 15 bản duy nhất và một bản trùng hoàn toàn.
- Trạng thái trực tiếp xác nhận gồm: màn xác nhận dự thi, màn hoàn tất/gợi ý luyện tập, 4 câu điền ô trống, 2 câu kéo–thả, 3 ma trận đúng/sai và 4 câu chọn một đáp án (cộng một bản trùng).
- Mọi script và phần chèn từ `chrome-extension://` bị loại trước khi phân tích. Audit không lưu tên tài khoản, giá trị input, UUID ứng dụng, cookie, token hay response body.
- Snapshot không chứa kích thước viewport, vì vậy chỉ xác nhận được các class responsive `sm/md/lg`, không gán võ đoán từng bản là desktop/tablet/mobile.
- Bộ artifact nằm tại `audit/`; `capture-analysis.json` ghi phân loại đã làm sạch, còn `final-report.md` mô tả đầy đủ ranh giới bằng chứng và cơ chế bảo vệ.
- Giao diện local được cập nhật theo các class đã xác nhận: màn **Xác nhận thông tin dự thi**, marker lựa chọn 32 px với trạng thái chọn `#1980FF`, ô trống gạch chân nội tuyến, item kéo–thả nền xám, nút đúng/sai 28/32 px và modal nộp bài nền đen 50%/panel tối đa 448 px.
