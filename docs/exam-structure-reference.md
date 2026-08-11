# HSA và V-SAT — mốc cấu trúc dùng trong phòng thi

Tài liệu này ghi lại mốc tham chiếu đã dùng khi xây dựng form soạn đề. Nội dung chính thức có thể được đơn vị tổ chức cập nhật theo từng năm; phần HSA 2027 trong ứng dụng luôn được đánh dấu là đề xuất.

## HSA 2026

- 3 phần, tối đa 150 điểm, 195 phút.
- Phần 1 — Toán học và xử lý số liệu: 50 câu, 75 phút; gồm 35 câu trắc nghiệm và 15 câu điền đáp án.
- Phần 2 — Văn học - Ngôn ngữ: 50 câu, 60 phút; trắc nghiệm khách quan 4 lựa chọn.
- Phần 3 — 50 câu, 60 phút; thí sinh chọn Khoa học (3 trong 5 chủ đề: Vật lí, Hóa học, Sinh học, Lịch sử, Địa lí) hoặc Tiếng Anh theo mã HSA-F.
- Có thể có câu hỏi thử nghiệm không tính điểm; thời gian bổ sung do quy định từng đợt quyết định.

Trong mã đề nội bộ, lựa chọn phần 3 được lưu trong `exams.structure_config.selection`. Ba phần vẫn là các `exam_sections` độc lập để giáo viên soạn, chỉnh thời lượng và nhập câu hỏi theo từng phần.

## HSA 2027

HSA 2027 được cung cấp như một profile đề xuất dựa trên baseline 2026. Giáo viên có thể đổi phiên bản, đổi lựa chọn phần 3 và sửa tên, thời lượng, số câu hoặc mô tả cấu trúc của từng phần. Không hiển thị profile này như một quy chế chính thức.

## V-SAT 2026

- 8 môn thi độc lập: Toán, Ngữ văn, Vật lí, Hóa học, Sinh học, Lịch sử, Địa lí và Tiếng Anh.
- Toán và Ngữ văn 90 phút; các môn còn lại 60 phút.
- Mỗi môn có 25 câu, tối đa 150 điểm, gồm 9 câu Đúng/Sai, 6 câu MCQ theo nhóm, 5 câu ghép hợp và 5 câu trả lời ngắn; Ngữ văn dùng phần viết luận ở nhóm trả lời cuối.
- Dạng Đúng/Sai và ghép hợp chấm theo tiểu mục; MCQ và trả lời ngắn chấm theo câu.

Vì môn V-SAT/THPTQG là độc lập, link kíp khách phải gắn với đúng một `exam_section`. Server chỉ tải, tính thời lượng và xuất dữ liệu của môn đã chọn.

## Nguồn tham chiếu

- VNU-IDT — [Dạng thức và đề cương chi tiết HSA từ năm 2026](https://idt.vnu.edu.vn/tin-tuc/tin-noi-bat/thong-bao-ban-hanh-dang-thuc-va-de-cuong-chi-tiet-bai-thi-hsa-tu-nam-2026)
- VNU-IDT — [Thông tin HSA 2026 và mã HSA/HSA-F](https://idt.vnu.edu.vn/tin-tuc/tin-noi-bat/ky-thi-danh-gia-nang-luc-hoc-sinh-thpt-hsa-nam-2026-luu-y-chuan-bi-dang-ky-ca-thi-ngay-01-02-2026)
- Đại học Cần Thơ — [Giới thiệu cấu trúc V-SAT 2026](https://vsat.ctu.edu.vn/gioi-thieu)
