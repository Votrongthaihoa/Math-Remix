# Bộ đề HSA full cho trình soạn LaTeX

`hsa-full-set.tex` là fixture nội dung nguyên bản dùng để kiểm thử renderer và luồng chọn tổ hợp HSA:

- Phần 1: 50 câu Toán học và xử lý số liệu (35 trắc nghiệm + 15 điền).
- Phần 2: 50 câu Văn học – Ngôn ngữ, có nhóm ngữ liệu `baidoc`.
- Phần 3: 17 câu cho mỗi ngân hàng Vật lí, Hóa học, Sinh học, Lịch sử, Địa lí và 50 câu Tiếng Anh HSA-F.

Mỗi câu Phần 3 có marker trong môi trường `ex`, ví dụ `% hsa-subject: vatly`. Khi các ngân hàng được lưu trong section Phần 3, server lọc theo mã:

- `Q01`–`Q10`: chọn đúng ba ngân hàng Khoa học tương ứng, tạo 51 câu.
- `Q21`: chọn ngân hàng `tienganh`, tạo 50 câu.

Trong workspace, mở từng section HSA ở mục “Soạn LaTeX” và bấm “Nạp mẫu HSA”. Trình soạn sẽ tự lấy đúng block `\phan1`, `\phan2` hoặc `\phan3` của section đang mở; sau đó chỉnh nội dung rồi bấm “Lưu”. Phần 3 cố ý nạp toàn bộ 6 ngân hàng để các mã Q01–Q10/Q21 dùng chung một nguồn câu hỏi, backend sẽ lọc theo marker khi thí sinh chọn tổ hợp. Có thể dùng toàn bộ file cho fixture/parser; không cần dán Phần 1/2 vào section Phần 3.

`hsa-similar-set.tex` là fixture nhỏ để kiểm tra nhanh các dạng công thức, bảng, ngữ liệu, đúng/sai và ghép nối.
