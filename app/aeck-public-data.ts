export type PublicCourse = {
  title: string;
  tags: string;
  status: string;
  image: string;
  featured?: boolean;
};

export type PublicTeacher = {
  name: string;
  slug: string;
  profile?: boolean;
};

export type PublicHonor = {
  name: string;
  achievement: string;
  image: string;
};

export const publicTeachers: PublicTeacher[] = [
  { name: "Thầy Vũ Gia Khoa", slug: "vu-gia-khoa", profile: true },
  { name: "Thầy Nguyễn Hoàng Tùng", slug: "nguyen-hoang-tung" },
  { name: "Thầy Hồ Hoàng", slug: "ho-hoang", profile: true },
  { name: "Thầy Minh Thành", slug: "minh-thanh", profile: true },
  { name: "Cô Nguyễn Thị Cúc", slug: "nguyen-thi-cuc", profile: true },
  { name: "Cô Thuỳ Trang", slug: "thuy-trang", profile: true },
  { name: "Cô Trần Thị Mơ", slug: "tran-thi-mo", profile: true },
  { name: "Cô Minh Thư", slug: "minh-thu", profile: true },
  { name: "Cô Bích Ngọc", slug: "bich-ngoc", profile: true },
  { name: "Cô Nguyễn Thuỳ Dung", slug: "nguyen-thuy-dung" },
  { name: "Anh Lê Vĩnh Phước", slug: "le-vinh-phuoc", profile: true },
  { name: "Anh Đức Nhân", slug: "duc-nhan", profile: true },
  { name: "Anh Nhật Nam", slug: "nhat-nam", profile: true },
  { name: "Chị Khánh Ngọc", slug: "khanh-ngoc", profile: true },
  { name: "Chị Diệu Hoa", slug: "dieu-hoa", profile: true },
];

export const publicHonors: PublicHonor[] = [
  { name: "Nguyễn Công Huy", achievement: "THỦ KHOA TSA ĐỢT 3", image: "nguyen-cong-huy-top-1" },
  { name: "Bùi Phan Anh Đức", achievement: "TOP 3 TSA ĐỢT 3", image: "bui-phan-anh-duc-top-3" },
  { name: "Nguyễn Tuấn Minh Tú", achievement: "TOP 3 TSA ĐỢT 1", image: "nguyen-tuan-minh-tu-top-3" },
  { name: "Lê Vĩnh Phước", achievement: "TOP 4 TSA ĐỢT 3", image: "le-vinh-phuoc-top-4" },
  { name: "Lê Văn Minh", achievement: "TOP 4 TSA ĐỢT 1", image: "le-van-minh-top-4" },
  { name: "Nguyễn Trọng Trường Anh", achievement: "TOP 4 TSA ĐỢT 2", image: "nguyen-trong-truong-anh-top-4" },
  { name: "Nhữ Đình Phú", achievement: "Á KHOA A00 THPTQG", image: "nhu-dinh-phu-a-khoa-a00" },
  { name: "Phạm Bá Tú", achievement: "THỦ KHOA HSA Q02", image: "pham-ba-tu-thu-khoa-hsa" },
  { name: "Nguyễn Trọng Trường Anh", achievement: "Á KHOA THPTQG", image: "nguyen-trong-truong-anh-a-khoa-thpt" },
];

export const publicCourses: PublicCourse[] = [
  { title: "[2K9 TSA] NÂNG CAO: TOÁN", tags: "TSA", status: "Tìm hiểu thêm", image: "tsa-nang-cao-toan", featured: true },
  { title: "[2K9 TSA] CHUYÊN ĐỀ: ĐỌC HIỂU - KHOA HỌC", tags: "TSA", status: "Đang mở đăng ký", image: "tsa-doc-hieu-khoa-hoc" },
  { title: "[2K9] NỀN TẢNG: TOÁN", tags: "TSA · HSA · QDA · BCA", status: "Đang mở đăng ký", image: "nen-tang-toan" },
  { title: "[2K9 - ĐGNL] CHUYÊN ĐỀ: SINH HỌC", tags: "HSA · QDA · BCA", status: "Đang mở đăng ký", image: "chuyen-de-sinh-hoc" },
  { title: "[2K9 - ĐGNL] CHUYÊN ĐỀ: HOÁ HỌC", tags: "HSA · QDA · BCA", status: "Đang mở đăng ký", image: "chuyen-de-hoa-hoc" },
  { title: "[2K9 - ĐGNL] CHUYÊN ĐỀ: VẬT LÝ", tags: "HSA · QDA · BCA", status: "Đang mở đăng ký", image: "chuyen-de-vat-ly" },
  { title: "[2K9 - ĐGNL] CHUYÊN ĐỀ: ĐỊA LÝ", tags: "HSA · QDA · BCA", status: "Đang mở đăng ký", image: "chuyen-de-dia-ly" },
  { title: "[2K9 - ĐGNL BCA] CHUYÊN ĐỀ: NGỮ VĂN", tags: "BCA", status: "Đang mở đăng ký", image: "ngu-van-bca" },
  { title: "[2K9 - ĐGNL QDA] CHUYÊN ĐỀ: NGỮ VĂN", tags: "QDA", status: "Đang mở đăng ký", image: "ngu-van-qda" },
  { title: "[2K9 - ĐGNL] CHUYÊN ĐỀ: LỊCH SỬ", tags: "HSA · QDA · BCA", status: "Đang mở đăng ký", image: "chuyen-de-lich-su" },
  { title: "[2K9 - ĐGNL] CHUYÊN ĐỀ: TIẾNG ANH", tags: "HSA · QDA · BCA", status: "Đang mở đăng ký", image: "chuyen-de-tieng-anh" },
  { title: "[2K9 - ĐGNL HSA] CHUYÊN ĐỀ: NGỮ VĂN", tags: "HSA", status: "Đang mở đăng ký", image: "ngu-van-hsa" },
  { title: "[2K9 - ĐGNL] NÂNG CAO: TOÁN", tags: "HSA · QDA · BCA", status: "Đang mở đăng ký", image: "dgnl-nang-cao-toan" },
];

export const publicArticleCards = [
  { slug: "luyen-thi-tsa", category: "ĐÁNH GIÁ TƯ DUY — TSA", title: "Kỳ thi Đánh giá tư duy TSA: toàn bộ thông tin cần biết", description: "TSA là gì, bài thi đánh giá những gì, thi trên máy hay trên giấy, kết quả dùng xét tuyển vào trường nào. Tổng hợp từ nguồn chính thức của ĐH Bách khoa Hà Nội." },
  { slug: "cau-truc-de-thi-tsa", category: "ĐÁNH GIÁ TƯ DUY — TSA", title: "Cấu trúc đề thi TSA: 3 phần, 100 câu, 150 phút", description: "Đề thi TSA gồm 3 phần: Tư duy Toán học 60 phút, Tư duy Đọc hiểu 30 phút, Tư duy Khoa học 60 phút. Chi tiết nội dung, 5 dạng câu hỏi và 3 mức độ tư duy." },
  { slug: "cach-tinh-diem-tsa", category: "ĐÁNH GIÁ TƯ DUY — TSA", title: "Cách tính điểm TSA: vì sao làm đúng nhiều câu chưa chắc điểm cao", description: "Điểm TSA không phải điểm thô. Bách khoa chấm bằng mô hình IRT 2 tham số rồi quy về thang 100. Giải thích quy trình 4 bước và vì sao điểm các đợt so sánh được với nhau." },
  { slug: "luyen-thi-hsa", category: "ĐÁNH GIÁ NĂNG LỰC — HSA", title: "Kỳ thi Đánh giá năng lực HSA của ĐHQG Hà Nội", description: "HSA là gì, ai tổ chức, thi trên máy tính ra sao, một năm được thi mấy lượt, kết quả dùng xét tuyển vào bao nhiêu trường. Tổng hợp từ nguồn chính thức của ĐHQG Hà Nội." },
  { slug: "cau-truc-de-thi-hsa", category: "ĐÁNH GIÁ NĂNG LỰC — HSA", title: "Cấu trúc đề thi HSA 2026: 3 phần, 150 câu, 195 phút", description: "Đề HSA gồm Toán 50 câu 75 phút, Văn học Ngôn ngữ 50 câu 60 phút và phần tự chọn Khoa học hoặc Tiếng Anh 50 câu 60 phút. Thang 150 điểm, sai không bị trừ điểm." },
  { slug: "dang-ky-thi-hsa", category: "ĐÁNH GIÁ NĂNG LỰC — HSA", title: "Đăng ký thi HSA: quy trình 8 bước và những mốc dễ trượt", description: "Hướng dẫn đăng ký thi Đánh giá năng lực HSA: 8 bước trên hệ thống, giấy tờ và ảnh cần chuẩn bị, hạn nộp lệ phí 96 giờ, tối đa 2 ca thi mỗi năm." },
] as const;

export const learningPackages = [
  {
    id: "tsa-2027",
    title: "Khoá Toàn diện TSA 2027",
    price: "2.600.000 ₫",
    image: "toan-dien-tsa-2027",
    description: "Khoá học bao gồm toàn bộ chương trình học TSA của AECK trong năm học 2026–2027, hệ thống iLearn, bài giảng ghi lại, phòng luyện TSA và các bài thi thử chấm IRT mô phỏng thuật toán của Đại học Bách khoa Hà Nội.",
  },
  {
    id: "test",
    title: "TEST - KHÔNG ĐĂNG KÍ",
    price: "2.000 ₫",
    image: "test-khong-dang-ki",
    description: "Gói thử nghiệm dành cho việc kiểm tra luồng đăng ký và thanh toán tự động.",
  },
] as const;
