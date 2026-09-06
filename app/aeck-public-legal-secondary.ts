type LegalSection = {
  id: string;
  title: string;
  blocks: Array<{ tag: "p" | "ul" | "ol" | "div"; text: string; items?: string[] }>;
};

const bulletSection = (id: string, title: string, items: string[]): LegalSection => ({
  id,
  title,
  blocks: [{ tag: "ul" as const, text: items.join(" "), items }],
});

const paragraphSection = (id: string, title: string, text: string): LegalSection => ({
  id,
  title,
  blocks: [{ tag: "p" as const, text }],
});

const legal = (
  slug: string,
  title: string,
  intro: string,
  sections: LegalSection[],
) => ({
  slug,
  title,
  updated: "CẬP NHẬT LẦN CUỐI: 03/09/2026",
  intro,
  toc: sections.map(({ title: sectionTitle, id }) => ({ label: sectionTitle, href: `#${id}` })),
  sections,
});

const secondaryLegalDocuments = {
  "dieu-kien-han-che-cung-cap": legal(
    "dieu-kien-han-che-cung-cap",
    "Các điều kiện hạn chế trong việc cung cấp hàng hoá, dịch vụ",
    "Có những trường hợp AECK không thể cung cấp dịch vụ, hoặc chỉ cung cấp trong giới hạn nhất định. Chúng tôi công bố trước những trường hợp đó ở đây để bạn biết rõ trước khi thanh toán, thay vì phát hiện ra khi đã mua.",
    [
      bulletSection("thoi-gian-cung-cap", "Ⅰ. Thời gian tiếp nhận và xử lý", [
        "Hệ thống nhận đăng ký và thanh toán 24 giờ mỗi ngày, 7 ngày mỗi tuần; các việc cần người xử lý được thực hiện trong khung 8h00 - 22h00 hằng ngày.",
        "Yêu cầu gửi ngoài khung giờ hỗ trợ, vào ngày lễ hoặc Tết được xử lý vào buổi làm việc kế tiếp.",
      ]),
      bulletSection("dieu-kien-nguoi-mua", "Ⅱ. Điều kiện với người mua", [
        "Bạn cần có tài khoản AECK hợp lệ với thông tin đăng ký chính xác và là của chính mình.",
        "Bạn được học thử miễn phí trước khi đăng ký; sau khi gói được kích hoạt thì không hoàn tiền, trừ trường hợp bất khả kháng được xét duyệt.",
        "Mỗi tài khoản dành cho một người học. Gói học tập không được chia sẻ, cho mượn, chuyển nhượng hay bán lại.",
      ]),
      bulletSection("gioi-han-ky-thuat", "Ⅲ. Giới hạn kỹ thuật", [
        "Dịch vụ yêu cầu thiết bị có kết nối Internet ổn định và trình duyệt còn được nhà sản xuất hỗ trợ.",
        "Số thiết bị và số phiên đăng nhập đồng thời có thể bị giới hạn để chống chia sẻ tài khoản.",
        "Video và tài liệu được bảo vệ kỹ thuật, có đánh dấu truy vết và không cho phép tải xuống ngoài chức năng do hệ thống cung cấp.",
      ]),
      bulletSection("pham-vi-thoi-han", "Ⅳ. Phạm vi và thời hạn cung cấp", [
        "Mỗi gói có phạm vi nội dung và thời hạn sử dụng riêng, được ghi tại trang giới thiệu gói.",
        "Sách và tài liệu in là tài liệu nội bộ đi kèm khoá học, chỉ gửi theo từng giai đoạn nếu chương trình có quy định.",
        "Tài liệu chỉ được gửi trong lãnh thổ Việt Nam và trong phạm vi các đơn vị vận chuyển nhận giao.",
      ]),
      paragraphSection("tu-choi-cung-cap", "Ⅴ. Trường hợp từ chối hoặc tạm dừng cung cấp", "AECK có quyền từ chối bán, tạm dừng hoặc chấm dứt cung cấp dịch vụ khi thông tin đăng ký sai, tài khoản bị chia sẻ, nội dung bị phát tán, có gian lận, chưa thanh toán đủ, giao dịch có dấu hiệu lừa đảo hoặc giá hiển thị sai do lỗi hệ thống. Khi đơn hàng bị huỷ vì lý do thuộc về AECK, bạn được hoàn lại toàn bộ số tiền đã thanh toán."),
      bulletSection("gian-doan", "Ⅵ. Bảo trì, gián đoạn và bất khả kháng", [
        "Hệ thống có thể tạm ngừng để bảo trì và nâng cấp; với bảo trì có kế hoạch, AECK thông báo trước.",
        "Nếu gián đoạn kéo dài làm bạn mất thời gian sử dụng đáng kể, AECK bù thêm thời hạn tương ứng với khoảng thời gian bị ảnh hưởng.",
      ]),
      paragraphSection("quyen-loi-khong-bi-loai-tru", "Ⅶ. Quyền lợi của bạn không bị loại trừ", "Các điều kiện hạn chế nhằm bảo vệ chất lượng dịch vụ và sự công bằng, không nhằm loại trừ trách nhiệm của AECK theo quy định pháp luật về bảo vệ quyền lợi người tiêu dùng. Khi AECK không cung cấp được dịch vụ đã bán, chúng tôi thông báo lý do và đề xuất bù thời gian, chuyển gói tương đương hoặc hoàn theo thời hạn còn lại."),
      paragraphSection("lien-he", "Ⅷ. Liên hệ", "Hộ kinh doanh AECK EDU - mã số thuế 034206001976. Địa chỉ: Số nhà 15 ngách 8 ngõ 181 Xuân Thuỷ, Phường Cầu Giấy, Thành phố Hà Nội, Việt Nam. Email hotro@aeck.vn, hotline 0776 362 944."),
    ],
  ),
  "quyen-va-nghia-vu-hai-ben": legal(
    "quyen-va-nghia-vu-hai-ben",
    "Quyền và nghĩa vụ của hai bên",
    "Khi bạn mua một gói học tập của AECK, giữa hai bên hình thành một giao dịch có quyền và nghĩa vụ rõ ràng. Trang này liệt kê đầy đủ những gì bạn được nhận, những gì bạn cần giữ, và những gì AECK cam kết làm.",
    [
      paragraphSection("cac-ben", "Ⅰ. Các bên trong giao dịch", "Bên cung cấp dịch vụ là Hộ kinh doanh AECK EDU. Bên sử dụng dịch vụ là người đăng ký tài khoản và thanh toán để sử dụng dịch vụ; với người học dưới 18 tuổi, cha mẹ hoặc người giám hộ là người xác lập giao dịch. Hệ thống nhận đăng ký và thanh toán 24/7, bộ phận hỗ trợ làm việc 8h00 - 22h00."),
      bulletSection("quyen-nguoi-hoc", "Ⅱ. Quyền của người học", [
        "Được cung cấp thông tin đầy đủ về nội dung, phạm vi, thời hạn và giá trước khi thanh toán.",
        "Được học thử miễn phí, truy cập nội dung đã mua trong thời hạn và xem báo cáo năng lực cá nhân.",
        "Được hỗ trợ kỹ thuật, bảo mật thông tin và gửi phản ánh theo các chính sách đã công bố.",
      ]),
      bulletSection("nghia-vu-nguoi-hoc", "Ⅲ. Nghĩa vụ của người học", [
        "Cung cấp thông tin trung thực, thanh toán đầy đủ và tự bảo mật mật khẩu.",
        "Không chia sẻ tài khoản, sao chép hoặc phát tán đề thi, bài giảng, tài liệu; không gian lận hoặc can thiệp kỹ thuật.",
        "Kiểm tra kỹ nội dung, giá, thời hạn và điều kiện của gói trước khi xác nhận đơn.",
      ]),
      bulletSection("quyen-aeck", "Ⅳ. Quyền của AECK", [
        "Yêu cầu xác minh thông tin khi cần, điều chỉnh giá và nội dung cho các đơn hàng tương lai.",
        "Tạm dừng hoặc chấm dứt quyền truy cập của tài khoản vi phạm và áp dụng biện pháp bảo vệ nội dung.",
      ]),
      bulletSection("nghia-vu-aeck", "Ⅴ. Nghĩa vụ của AECK", [
        "Cung cấp đúng nội dung và thời hạn của gói đã thanh toán, niêm yết giá minh bạch và mở quyền truy cập sau khi đối soát.",
        "Bảo mật dữ liệu, duy trì hệ thống trong khả năng hợp lý, tiếp nhận khiếu nại và thực hiện chính sách hỗ trợ.",
      ]),
      bulletSection("hieu-luc", "Ⅵ. Hiệu lực và chấm dứt", [
        "Quyền và nghĩa vụ phát sinh từ khi bạn đăng ký tài khoản và mở rộng theo từng đơn hàng đã thanh toán.",
        "Khi giao dịch chấm dứt, các nghĩa vụ đã phát sinh về thanh toán, hoàn tiền, bảo mật và sở hữu trí tuệ vẫn tiếp tục có hiệu lực.",
      ]),
      paragraphSection("phap-luat-ap-dung", "Ⅶ. Pháp luật áp dụng và liên hệ", "Quan hệ giữa hai bên được điều chỉnh bởi pháp luật Việt Nam. Tranh chấp được giải quyết trước hết bằng thương lượng, hoà giải; nếu không đạt thoả thuận, vụ việc được đưa ra cơ quan hoặc toà án có thẩm quyền tại Việt Nam."),
    ],
  ),
  "chinh-sach-thanh-toan": legal(
    "chinh-sach-thanh-toan",
    "Chính sách thanh toán",
    "AECK nhận thanh toán bằng chuyển khoản ngân hàng theo mã đơn hàng và được đối soát. Bạn có thể tự đặt mua trên website, hoặc đăng ký qua fanpage, Zalo, hotline và được tư vấn viên hướng dẫn. Trang này mô tả đúng những gì xảy ra từ lúc bạn quyết định mua tới lúc quyền học được mở.",
    [
      paragraphSection("pham-vi", "Ⅰ. Phạm vi áp dụng", "Chính sách áp dụng cho các gói học tập, khoá học, phòng luyện đề và tài liệu điện tử do AECK cung cấp trên website hoặc qua kênh tư vấn chính thức."),
      bulletSection("phuong-thuc", "Ⅱ. Phương thức thanh toán được chấp nhận", [
        "Phương thức chính là chuyển khoản ngân hàng theo đúng mã đơn hàng và nội dung thanh toán được hướng dẫn.",
        "Không cung cấp mật khẩu ngân hàng, mã OTP hoặc thông tin thẻ cho bất kỳ người tự xưng là nhân viên nào.",
      ]),
      bulletSection("quy-trinh", "Ⅲ. Quy trình thanh toán", [
        "Chọn gói và kiểm tra thông tin đơn hàng, chuyển khoản đúng số tiền, sau đó chờ hệ thống đối soát.",
        "Quyền học được mở tự động sau khi giao dịch hợp lệ; nếu sau 30 phút chưa được mở, hãy liên hệ kèm mã đơn và chứng từ.",
      ]),
      paragraphSection("dang-ky-qua-tu-van", "Ⅳ. Đăng ký và thanh toán qua fanpage, Zalo, hotline", "Khi đăng ký qua kênh tư vấn, nhân viên xác nhận gói, giá, thông tin tài khoản và hướng dẫn chuyển khoản. Bạn chỉ thanh toán vào thông tin chính thức đã được xác nhận và lưu lại nội dung trao đổi để đối soát."),
      bulletSection("so-tien", "Ⅴ. Đồng tiền và số tiền thanh toán", [
        "Giá được niêm yết bằng đồng Việt Nam và số tiền cần thanh toán là số tiền hiển thị trên đơn hàng.",
        "Mọi khoản chuyển thừa hoặc chuyển trùng được xử lý đối soát riêng, không tự động xem là phí của gói học tập.",
      ]),
      paragraphSection("chung-tu", "Ⅵ. Xác nhận và chứng từ", "Email xác nhận, mã đơn hàng và chứng từ chuyển khoản là căn cứ để kiểm tra trạng thái thanh toán và xử lý yêu cầu hỗ trợ."),
      bulletSection("an-toan", "Ⅶ. An toàn khi thanh toán", [
        "AECK không yêu cầu bạn cung cấp mật khẩu, mã OTP hoặc toàn bộ thông tin đăng nhập ngân hàng.",
        "Nếu phát hiện thông tin thanh toán bất thường, hãy dừng giao dịch và liên hệ qua email, hotline hoặc fanpage chính thức.",
      ]),
      paragraphSection("hoan-tien", "Ⅷ. Hoàn tiền", "Gói học tập đã kích hoạt không hoàn tiền do đổi ý, bận việc hoặc đăng ký nhầm; trường hợp chuyển khoản thừa, lỗi kỹ thuật kéo dài, AECK ngừng cung cấp dịch vụ hoặc bất khả kháng có minh chứng được xem xét theo chính sách liên quan."),
      paragraphSection("lien-he", "Ⅸ. Liên hệ", "Email hotro@aeck.vn, hotline 0776 362 944 hoặc fanpage chính thức của AECK."),
    ],
  ),
  "chinh-sach-gia": legal(
    "chinh-sach-gia",
    "Chính sách giá",
    "Giá của mỗi gói học tập được niêm yết công khai ngay trên trang giới thiệu gói. Trang này giải thích giá đó gồm những gì, khi nào giá có thể thay đổi và điều gì xảy ra với các đơn đã thanh toán khi có thay đổi.",
    [
      bulletSection("niem-yet", "Ⅰ. Nguyên tắc niêm yết giá", [
        "Giá được niêm yết bằng đồng Việt Nam ngay tại trang của từng gói học tập, khoá học hoặc phòng luyện đề.",
        "Giá hiển thị là số tiền cuối cùng bạn phải trả cho gói đó, theo thông tin công bố tại thời điểm đặt mua.",
      ]),
      paragraphSection("bao-gom", "Ⅱ. Giá đã bao gồm những gì", "Giá gói bao gồm quyền truy cập vào nội dung, tính năng và thời hạn được mô tả trên trang giới thiệu. Các quyền lợi đi kèm, nếu có, được ghi rõ theo từng chương trình."),
      paragraphSection("phi-phat-sinh", "Ⅲ. Phí vận chuyển và các chi phí phát sinh khác", "Nếu gói có tài liệu in hoặc vật phẩm gửi kèm, chi phí và phạm vi giao nhận được công bố trước khi thanh toán. AECK không tự thu thêm khoản ngoài giá đã niêm yết nếu không thông báo rõ."),
      paragraphSection("phi-su-dung-website", "Ⅳ. Chi phí sử dụng website", "Việc truy cập website và học nội dung trong gói không phát sinh phí sử dụng website riêng ngoài giá gói, trừ khi một chương trình được công bố điều kiện khác trước khi đăng ký."),
      paragraphSection("thay-doi-gia", "Ⅴ. Điều chỉnh giá", "AECK có thể điều chỉnh giá cho đơn hàng hoặc chương trình mới. Thay đổi không làm tăng số tiền của đơn đã được xác nhận và thanh toán thành công."),
      paragraphSection("uu-dai", "Ⅵ. Ưu đãi và khuyến mại", "Điều kiện, thời hạn và số lượng của ưu đãi được ghi ngay tại trang chương trình. Mỗi tài khoản có thể bị giới hạn số suất ưu đãi theo nội dung đã công bố."),
      paragraphSection("sai-lech-gia", "Ⅶ. Khi giá hiển thị sai", "Nếu giá hoặc nội dung gói hiển thị sai do lỗi hệ thống, AECK thông báo cho bạn trước khi hoàn tất cung cấp. Bạn có quyền xác nhận lại theo giá đúng hoặc nhận hoàn lại toàn bộ số tiền đã thanh toán cho đơn bị huỷ."),
      paragraphSection("lien-he", "Ⅷ. Liên hệ", "Mọi thắc mắc về giá và ưu đãi được tiếp nhận qua email hotro@aeck.vn, hotline 0776 362 944 hoặc fanpage chính thức."),
    ],
  ),
  "chinh-sach-van-chuyen-doi-tra": legal(
    "chinh-sach-van-chuyen-doi-tra",
    "Chính sách vận chuyển - kiểm tra - đổi trả hàng",
    "Thứ AECK bán là gói học tập trực tuyến, được mở tự động trên tài khoản của bạn. Sách và tài liệu in không bán lẻ: đó là tài liệu nội bộ của khoá học, gửi cho người học theo từng giai đoạn, nếu có. Trang này nói rõ cách bàn giao, kiểm tra khi nhận tài liệu và chính sách sau khi học thử.",
    [
      bulletSection("pham-vi", "Ⅰ. Phạm vi áp dụng", [
        "Sản phẩm số gồm gói học tập, khoá học, phòng luyện đề, tài liệu điện tử và nội dung mở trên tài khoản AECK.",
        "Tài liệu nội bộ và quà tặng nếu có chỉ đi kèm khoá học, không được bán lẻ.",
      ]),
      bulletSection("giao-san-pham-so", "Ⅱ. Giao nhận sản phẩm số", [
        "Ngay khi giao dịch được đối soát, quyền truy cập được mở tự động trên tài khoản đã tạo đơn, thông thường trong vài phút.",
        "Nếu sau 30 phút quyền học chưa mở, hãy liên hệ kèm mã đơn và ảnh chụp giao dịch; yêu cầu được xử lý trong vòng 24 giờ làm việc.",
      ]),
      bulletSection("van-chuyen-vat-pham", "Ⅲ. Vận chuyển tài liệu của khoá học", [
        "Tài liệu được gửi theo tiến độ của khoá học qua các đơn vị vận chuyển tại Việt Nam.",
        "Thời gian dự kiến là 1 - 3 ngày làm việc trong nội thành Hà Nội và 3 - 7 ngày với các tỉnh thành khác kể từ khi bàn giao.",
      ]),
      bulletSection("dong-goi-chung-tu", "Ⅳ. Đóng gói, chứng từ và trách nhiệm của các bên", [
        "AECK chịu trách nhiệm đóng gói, ghi đúng thông tin người nhận và cung cấp chứng từ đối chiếu.",
        "Hư hỏng hoặc thất lạc trong quá trình vận chuyển được tra soát; nếu không xử lý được, AECK gửi bù tài liệu.",
      ]),
      paragraphSection("kiem-tra-khi-nhan", "Ⅴ. Kiểm tra hàng khi nhận", "Nếu đơn vị vận chuyển cho phép, bạn nên kiểm tra ngay lúc nhận; nếu không, hãy quay video lúc mở kiện hàng. Khi phát hiện sai sót, giữ nguyên hiện trạng và báo trong vòng 48 giờ kể từ khi nhận."),
      bulletSection("doi-tra-vat-pham", "Ⅵ. Gửi bù tài liệu", [
        "AECK gửi bù khi giao sai, thiếu số lượng, lỗi in ấn hoặc tài liệu hư hỏng do vận chuyển.",
        "Yêu cầu cần kèm video mở kiện, ảnh phần bị lỗi và được gửi trong thời hạn quy định.",
      ]),
      paragraphSection("hoan-tien-san-pham-so", "Ⅶ. Học thử và chính sách không hoàn tiền khoá học", "Bạn được học thử miễn phí trước khi đăng ký. Sau khi gói được kích hoạt, AECK không hoàn tiền do đổi ý, bận việc, đăng ký nhầm hoặc không sử dụng; trường hợp bất khả kháng có minh chứng được xét duyệt riêng."),
      bulletSection("quy-trinh-yeu-cau", "Ⅷ. Quy trình yêu cầu gửi bù tài liệu hoặc xét duyệt bất khả kháng", [
        "Gửi yêu cầu qua email, hotline hoặc fanpage kèm mã đơn, mô tả và minh chứng.",
        "AECK xác nhận trong 24 giờ làm việc, xác minh trong 1 - 3 ngày và thông báo phương án xử lý.",
      ]),
      paragraphSection("lien-he", "Ⅸ. Liên hệ", "Email hotro@aeck.vn, hotline 0776 362 944 hoặc fanpage chính thức của AECK."),
    ],
  ),
  "chinh-sach-khieu-nai": legal(
    "chinh-sach-khieu-nai",
    "Phương thức tiếp nhận và giải quyết yêu cầu, phản ánh, khiếu nại",
    "Khi có điều gì đó không đúng như bạn mong đợi, việc đầu tiên nên làm là báo cho chúng tôi. Trang này cho bạn biết gửi phản ánh ở đâu, cần chuẩn bị thông tin gì, ai xử lý và bao lâu thì có kết quả.",
    [
      paragraphSection("kenh-tiep-nhan", "Ⅰ. Kênh tiếp nhận", "AECK tiếp nhận qua email hotro@aeck.vn, hotline và Zalo 0776 362 944, fanpage chính thức, trang cá nhân trên hệ thống hoặc văn bản gửi tới địa chỉ công bố. Các kênh nhận phản ánh 24/7; bộ phận hỗ trợ trực máy 8h00 - 22h00."),
      bulletSection("thong-tin-can-co", "Ⅱ. Thông tin cần cung cấp", [
        "Họ tên và email hoặc số điện thoại đã đăng ký tài khoản.",
        "Mã đơn hàng, tên gói hoặc phòng luyện đề liên quan và thời điểm xảy ra sự việc.",
        "Mô tả điều đã xảy ra, mong muốn được giải quyết và ảnh chụp, video hoặc chứng từ nếu có.",
      ]),
      bulletSection("quy-trinh", "Ⅲ. Quy trình xử lý", [
        "Tiếp nhận và cấp mã theo dõi, phân loại tới bộ phận kỹ thuật, học vụ hoặc tài chính.",
        "Xác minh dữ liệu, đề xuất phương án, thực hiện phương án đã thống nhất và thông báo kết quả.",
      ]),
      paragraphSection("thoi-han", "Ⅳ. Thời hạn xử lý", "AECK xác nhận đã tiếp nhận trong 24 giờ làm việc. Sự cố kỹ thuật, thanh toán hoặc kích hoạt thường được xử lý trong 1 - 3 ngày làm việc; vụ việc phức tạp cần bên thứ ba có thể kéo dài tối đa 15 ngày làm việc và được thông báo tiến độ."),
      paragraphSection("trach-nhiem-nguoi-gui", "Ⅴ. Trách nhiệm của người gửi và trường hợp từ chối giải quyết", "Người gửi cần cung cấp thông tin trung thực và phối hợp xác minh. AECK có quyền từ chối khi thông tin không chính xác, không có căn cứ xác minh hoặc có dấu hiệu gian lận; trong mọi trường hợp, lý do từ chối được trả lời bằng văn bản."),
      bulletSection("nguyen-tac", "Ⅵ. Nguyên tắc xử lý", [
        "Mọi phản ánh đều được ghi nhận và người học được thông báo lý do của kết luận.",
        "Thông tin người phản ánh được bảo mật; người học không bị đối xử bất lợi vì đã gửi phản ánh.",
        "Hồ sơ được lưu tối thiểu 12 tháng để phục vụ tra cứu và cải thiện dịch vụ.",
      ]),
      paragraphSection("tranh-chap", "Ⅶ. Giải quyết tranh chấp", "AECK ưu tiên thương lượng và hoà giải trực tiếp. Nếu hai bên không đạt thoả thuận, bạn có quyền liên hệ cơ quan nhà nước có thẩm quyền về bảo vệ quyền lợi người tiêu dùng hoặc khởi kiện theo pháp luật Việt Nam."),
      paragraphSection("lien-he", "Ⅷ. Liên hệ", "Đơn vị tiếp nhận và giải quyết khiếu nại là Hộ kinh doanh AECK EDU. Email hotro@aeck.vn, hotline 0776 362 944."),
    ],
  ),
} as const;

export default secondaryLegalDocuments;
