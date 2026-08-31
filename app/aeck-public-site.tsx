"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Info,
  Menu,
  MessageCircle,
  Phone,
  X,
} from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import articleDocuments from "./aeck-public-articles.json";
import legalDocuments from "./aeck-public-legal.json";
import {
  learningPackages,
  publicArticleCards,
  publicCourses,
  publicHonors,
  publicTeachers,
  type PublicTeacher,
} from "./aeck-public-data";
import { type AeckPublicRoute } from "./aeck-public-routes";
import styles from "./aeck-public-site.module.css";

type ContentBlock = {
  tag: "p" | "ul" | "ol" | "div";
  text: string;
  items?: string[];
};

type ContentSection = {
  id: string;
  title: string;
  blocks?: ContentBlock[];
  faq?: Array<{ question: string; answer: string }>;
};

type ArticleDocument = {
  slug: string;
  title: string;
  eyebrow: string;
  intro: string;
  toc: Array<{ label: string; href: string }>;
  sections: ContentSection[];
  references?: {
    links?: Array<{ label: string; href: string }>;
    note?: string;
  };
};

type LegalDocument = {
  slug: string;
  title: string;
  intro: string;
  toc: Array<{ label: string; href: string }>;
  sections: ContentSection[];
};

const articleBySlug = articleDocuments as Record<string, ArticleDocument>;
const legalBySlug = legalDocuments as Record<string, LegalDocument>;
const publicAsset = (path: string) => `/aeck-public/${path}`;

const legalLead: Record<string, string> = {
  "dieu-khoan-dich-vu":
    "Cảm ơn bạn đã tin tưởng AECK. Trước khi bắt đầu học và luyện đề, mời bạn dành vài phút đọc qua các điều khoản dưới đây. Chúng tôi viết phần này để bạn hiểu rõ mình được gì, cần giữ những gì, và AECK chịu trách nhiệm tới đâu.",
  "chinh-sach-bao-mat":
    "AECK tôn trọng quyền riêng tư của bạn. Chính sách này giải thích những thông tin chúng tôi thu thập, cách sử dụng, thời gian lưu giữ và những quyền bạn có khi sử dụng nền tảng.",
};

function SiteHeader({ route }: { route: AeckPublicRoute }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const headerInnerRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const menuButton = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    const siteSiblings = Array.from(headerRef.current?.parentElement?.children ?? [])
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== headerRef.current);
    const background = headerInnerRef.current ? [headerInnerRef.current, ...siteSiblings] : siteSiblings;
    const savedInertStates = background.map((element) => {
      const original = element.inert;
      element.inert = true;
      return { element, original };
    });
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = mobileMenuRef.current?.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !mobileMenuRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !mobileMenuRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      savedInertStates.forEach(({ element, original }) => {
        element.inert = original;
      });
      window.removeEventListener("keydown", onKeyDown);
      menuButton?.focus();
    };
  }, [mobileOpen]);

  const links = [
    { href: "/giao-vien", label: "Giáo viên", active: route === "giao-vien" },
    { href: "/goi-hoc-tap", label: "Gói học tập", active: route === "goi-hoc-tap" },
    { href: "/dang-ky-minh-chung", label: "Đăng ký minh chứng", active: route === "dang-ky-minh-chung" },
  ];

  return (
    <header ref={headerRef} className={styles.header}>
      <div ref={headerInnerRef} className={styles.headerInner}>
        <Link className={styles.brand} href="/" aria-label="Trang chủ AECK">
          <Image
            src={publicAsset("logo-wordmark-red.svg")}
            alt="AECK"
            width={180}
            height={49}
            priority
          />
        </Link>
        <nav className={styles.desktopNav} aria-label="Điều hướng chính">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={item.active ? styles.navActive : undefined}
              aria-current={item.active ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <Link className={styles.learningSpace} href="/courses">
            Không gian học tập
          </Link>
          <Link className={styles.loginButton} href="/login">
            Đăng nhập
          </Link>
          <Link className={styles.registerButton} href="/login?intent=register">
            Đăng ký
          </Link>
        </div>
        <button
          ref={menuButtonRef}
          className={styles.mobileMenuButton}
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Mở menu"
          aria-controls="aeck-public-mobile-menu"
          aria-expanded={mobileOpen}
        >
          <Menu aria-hidden="true" />
        </button>
      </div>
      {mobileOpen ? (
        <div className={styles.mobileMenuShade} role="presentation" onMouseDown={() => setMobileOpen(false)}>
          <div
            ref={mobileMenuRef}
            id="aeck-public-mobile-menu"
            className={styles.mobileMenuPanel}
            role="dialog"
            aria-modal="true"
            aria-label="Menu điều hướng"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.mobileMenuHead}>
              <Image src={publicAsset("logo-wordmark-red.svg")} alt="AECK" width={148} height={40} />
              <button ref={closeButtonRef} type="button" onClick={() => setMobileOpen(false)} aria-label="Đóng menu">
                <X aria-hidden="true" />
              </button>
            </div>
            <nav aria-label="Điều hướng trên di động">
              <Link href="/" onClick={() => setMobileOpen(false)} aria-current={route === "home" ? "page" : undefined}>
                Trang chủ
              </Link>
              {links.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} aria-current={item.active ? "page" : undefined}>
                  {item.label}
                </Link>
              ))}
              <Link href="/courses" onClick={() => setMobileOpen(false)}>
                Không gian học tập
              </Link>
            </nav>
            <div className={styles.mobileAuthActions}>
              <Link href="/login">Đăng nhập</Link>
              <Link href="/login?intent=register">Đăng ký</Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function FloatingContacts() {
  return (
    <nav className={styles.floatingContacts} aria-label="Liên hệ nhanh">
      <a className={styles.zaloContact} href="https://zalo.me/0776362944" target="_blank" rel="noreferrer" aria-label="Chat Zalo" title="Chat Zalo">
        Zalo
      </a>
      <a className={styles.messengerContact} href="https://m.me/aeck.edu.vn" target="_blank" rel="noreferrer" aria-label="Nhắn Messenger" title="Nhắn Messenger">
        <MessageCircle aria-hidden="true" />
      </a>
      <a className={styles.facebookContact} href="https://www.facebook.com/aeck.edu.vn" target="_blank" rel="noreferrer" aria-label="Fanpage AECK" title="Fanpage AECK">
        <span className={styles.facebookGlyph} aria-hidden="true">f</span>
      </a>
      <a className={styles.phoneContact} href="tel:0776362944" aria-label="Gọi 0776 362 944" title="Gọi 0776 362 944">
        <Phone aria-hidden="true" />
      </a>
    </nav>
  );
}

function FullFooter() {
  return (
    <footer className={styles.fullFooter}>
      <div className={styles.footerInner}>
        <section className={styles.footerBrand}>
          <Link href="/" aria-label="Trang chủ AECK">
            <Image src={publicAsset("footer/logo-white.png")} alt="AECK" width={220} height={58} />
          </Link>
          <strong>HỆ THỐNG GIÁO DỤC TRỰC TUYẾN AECK</strong>
          <a href="mailto:hotro@aeck.vn">hotro@aeck.vn</a>
          <a href="tel:0776362944">0776 362 944</a>
          <a href="https://www.facebook.com/aeck.edu.vn" target="_blank" rel="noreferrer">Fanpage AECK</a>
        </section>
        <section>
          <h2>Thông tin</h2>
          <Link href="/dieu-khoan-dich-vu">Điều khoản dịch vụ</Link>
          <Link href="/chinh-sach-bao-mat">Chính sách bảo mật</Link>
        </section>
        <section className={styles.footerFanpages}>
          <h2>Fanpage</h2>
          <a href="https://www.facebook.com/aeck.edu.vn" target="_blank" rel="noreferrer">Anh Em Cây Khế - Chinh phục TSA / HSA</a>
          <a href="https://www.facebook.com/tsa.aeck.edu.vn" target="_blank" rel="noreferrer">Luyện thi Đánh giá tư duy TSA - AECK</a>
          <a href="https://www.facebook.com/hsa.aeck.edu.vn" target="_blank" rel="noreferrer">Luyện thi Đánh giá năng lực HSA - AECK</a>
        </section>
      </div>
      <p className={styles.copyright}>Bản quyền thuộc về Hệ thống Khảo thí AECK</p>
    </footer>
  );
}

function CompactFooter() {
  return (
    <footer className={styles.compactFooter}>
      <div>
        <strong>HỆ THỐNG GIÁO DỤC TRỰC TUYẾN AECK</strong>
        <p><a href="mailto:hotro@aeck.vn">hotro@aeck.vn</a><span aria-hidden="true">·</span><a href="tel:0776362944">0776 362 944</a></p>
      </div>
    </footer>
  );
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div className={styles.modalShade} role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className={`${styles.modal} ${wide ? styles.modalWide : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button ref={closeRef} className={styles.modalClose} type="button" onClick={onClose} aria-label="Đóng">
          <X aria-hidden="true" />
        </button>
        {children}
      </div>
    </div>
  );
}

function TeacherCard({ teacher, onOpen, compact = false }: { teacher: PublicTeacher; onOpen?: (teacher: PublicTeacher) => void; compact?: boolean }) {
  const image = (
    <Image
      src={publicAsset(`teachers/${teacher.slug}.webp`)}
      alt={teacher.name}
      width={600}
      height={650}
      sizes={compact ? "(max-width: 640px) 44vw, 240px" : "(max-width: 640px) 46vw, (max-width: 1000px) 30vw, 260px"}
    />
  );
  return teacher.profile && onOpen ? (
    <button className={styles.teacherCard} type="button" onClick={() => onOpen(teacher)} aria-label={`Xem thông tin ${teacher.name}`}>
      {image}
    </button>
  ) : (
    <div className={styles.teacherCard}>{image}</div>
  );
}

function TeacherProfileModal({ teacher, onClose }: { teacher: PublicTeacher; onClose: () => void }) {
  return (
    <Modal title={`Thông tin ${teacher.name}`} onClose={onClose} wide>
      <div className={styles.profileModalHeading}>
        <span>THÔNG TIN GIÁO VIÊN</span>
        <Image src={publicAsset("logo-wordmark-red.svg")} alt="AECK" width={116} height={31} />
      </div>
      <Image
        className={styles.teacherProfileImage}
        src={publicAsset(`profiles/${teacher.slug}.webp`)}
        alt={`Thông tin ${teacher.name}`}
        width={1200}
        height={1200}
        sizes="(max-width: 700px) calc(100vw - 40px), 760px"
      />
    </Modal>
  );
}

function CoursePreviewCard({ course }: { course: (typeof publicCourses)[number] }) {
  const normalizedTags = course.tags.toLocaleUpperCase("vi");
  const hasTsa = normalizedTags.includes("TSA");
  const hasHsa = ["HSA", "ĐGNL", "QDA", "BCA"].some((tag) => normalizedTags.includes(tag));
  const href = hasTsa && hasHsa ? "/courses" : `/courses?examType=${hasHsa ? "HSA" : "TSA"}`;
  return (
    <Link className={`${styles.courseCard} ${course.featured ? styles.courseFeatured : ""}`} href={href}>
      <div className={styles.courseImageWrap}>
        <Image src={publicAsset(`courses/${course.image}.png`)} alt={course.title} width={800} height={450} sizes="(max-width: 640px) calc(100vw - 32px), 410px" />
        {course.featured ? <span>NỔI BẬT</span> : null}
      </div>
      <div className={styles.courseCardBody}>
        <span>{course.tags}</span>
        <h3>{course.title}</h3>
        <div><small>{course.status}</small><ArrowRight aria-hidden="true" /></div>
      </div>
    </Link>
  );
}

function ArticlePreviewCard({ article, compact = false }: { article: (typeof publicArticleCards)[number]; compact?: boolean }) {
  return (
    <Link className={`${styles.articlePreview} ${compact ? styles.articlePreviewCompact : ""}`} href={`/${article.slug}`}>
      <span>{article.category}</span>
      <h3>{article.title}</h3>
      {!compact ? <p>{article.description}</p> : null}
      <b>Đọc tiếp <ArrowRight aria-hidden="true" /></b>
    </Link>
  );
}

function HomePage() {
  const [teacherOffset, setTeacherOffset] = useState(0);
  const [honorOffset, setHonorOffset] = useState(0);
  const [selectedTeacher, setSelectedTeacher] = useState<PublicTeacher | null>(null);
  const featuredTeachers = useMemo(
    () => Array.from({ length: 4 }, (_, index) => publicTeachers[(teacherOffset + index) % publicTeachers.length]),
    [teacherOffset],
  );
  const visibleHonors = useMemo(
    () => Array.from({ length: 9 }, (_, index) => publicHonors[(honorOffset + index) % publicHonors.length]),
    [honorOffset],
  );

  return (
    <>
      <main>
        <section className={styles.homeHero}>
          <div className={styles.heroIntro}>
            <p>Bạn sẽ được trải nghiệm <strong>NGUỒN ĐỀ PHONG PHÚ</strong></p>
            <h1>GIẢI PHÁP HỌC TẬP TOÀN DIỆN</h1>
            <div className={styles.heroStats} aria-label="Thông tin nền tảng">
              <span><strong>NỀN TẢNG</strong><small>HÀNG ĐẦU<br />LUYỆN THI ONLINE</small></span>
              <span><strong>10.000+</strong><small>ĐÃ THAM GIA</small></span>
              <span><strong>KHOÁ HỌC</strong><small>TOÀN QUỐC<br />HỌC ONLINE</small></span>
            </div>
          </div>
          <div className={styles.teacherBannerTitle}>
            <span>SÁNG TẠO - TIÊN PHONG</span>
            <div><strong>ĐỘI NGŨ GIÁO VIÊN</strong><Image src={publicAsset("logo-wordmark-red.svg")} alt="AECK" width={150} height={40} /></div>
          </div>
          <div className={styles.homeTeacherCarousel}>
            <button type="button" onClick={() => setTeacherOffset((value) => (value - 1 + publicTeachers.length) % publicTeachers.length)} aria-label="Giáo viên trước">
              <ChevronLeft aria-hidden="true" />
            </button>
            <div className={styles.homeTeacherGrid}>
              {featuredTeachers.map((teacher) => (
                <TeacherCard key={teacher.slug} teacher={teacher} compact onOpen={setSelectedTeacher} />
              ))}
            </div>
            <button type="button" onClick={() => setTeacherOffset((value) => (value + 1) % publicTeachers.length)} aria-label="Giáo viên tiếp theo">
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          <section className={styles.honorBoard} aria-label="Vinh danh học sinh AECK">
            <Image className={styles.honorTitle} src={publicAsset("dai-lo-danh-vong.webp")} alt="Đại lộ danh vọng" width={500} height={90} />
            <button className={styles.honorPrevious} type="button" onClick={() => setHonorOffset((value) => (value - 1 + publicHonors.length) % publicHonors.length)} aria-label="Thành tích trước">
              <ChevronLeft aria-hidden="true" />
            </button>
            <div className={styles.honorGrid}>
              {visibleHonors.map((honor, index) => (
                <article key={`${honor.image}-${index}`}>
                  <Image src={publicAsset(`honors/${honor.image}.webp`)} alt={honor.name} width={600} height={600} sizes="(max-width: 640px) calc(100vw - 68px), 280px" />
                  <strong>{honor.achievement}</strong>
                  <span>{honor.name}</span>
                </article>
              ))}
            </div>
            <button className={styles.honorNext} type="button" onClick={() => setHonorOffset((value) => (value + 1) % publicHonors.length)} aria-label="Thành tích tiếp theo">
              <ChevronRight aria-hidden="true" />
            </button>
          </section>
        </section>

        <section className={styles.courseSection}>
          <div className={styles.sectionHeading}>
            <div>
              <span>KHOÁ LUYỆN THI 2K9</span>
              <h2>Luyện đúng trọng tâm,<br /><strong>thi đúng thực chiến.</strong></h2>
              <p>Hệ thống chuyên đề bám sát cấu trúc đề, mỗi khoá đi kèm ngân hàng đề thi thử và chữa chi tiết trên nền tảng AECK.</p>
            </div>
            <Link href="/courses">Xem tất cả khoá <ArrowRight aria-hidden="true" /></Link>
          </div>
          <div className={styles.courseGrid}>
            {publicCourses.map((course) => <CoursePreviewCard key={course.image} course={course} />)}
          </div>
        </section>

        <section className={styles.knowledgeSection}>
          <div className={styles.knowledgeInner}>
            <h2>Tìm hiểu kỳ thi</h2>
            <div className={styles.articleGrid}>
              {publicArticleCards.map((article) => <ArticlePreviewCard key={article.slug} article={article} />)}
            </div>
          </div>
        </section>
      </main>
      <FullFooter />
      {selectedTeacher ? <TeacherProfileModal teacher={selectedTeacher} onClose={() => setSelectedTeacher(null)} /> : null}
    </>
  );
}

function TeachersPage() {
  const [selectedTeacher, setSelectedTeacher] = useState<PublicTeacher | null>(null);
  return (
    <main className={styles.teachersPage}>
      <div className={styles.teacherBannerTitle}>
        <span>SÁNG TẠO - TIÊN PHONG</span>
        <div><h1>ĐỘI NGŨ GIÁO VIÊN</h1><Image src={publicAsset("logo-wordmark-red.svg")} alt="AECK" width={150} height={40} /></div>
      </div>
      <div className={styles.allTeacherGrid}>
        {publicTeachers.map((teacher) => <TeacherCard key={teacher.slug} teacher={teacher} onOpen={setSelectedTeacher} />)}
      </div>
      {selectedTeacher ? <TeacherProfileModal teacher={selectedTeacher} onClose={() => setSelectedTeacher(null)} /> : null}
    </main>
  );
}

function PackagesPage() {
  const [selectedPackage, setSelectedPackage] = useState<(typeof learningPackages)[number] | null>(null);
  return (
    <main className={styles.packagesPage}>
      <div className={styles.packagesInner}>
        <header>
          <h1>Gói học tập</h1>
          <p>Đăng kí gói học tập để mở khóa toàn bộ khoá học và phòng luyện thi</p>
        </header>
        <div className={styles.packageGrid}>
          {learningPackages.map((item) => (
            <article className={styles.packageCard} key={item.id}>
              <div className={styles.packageImage}>
                <Image src={publicAsset(`packages/${item.image}.png`)} alt={item.title} width={1280} height={720} sizes="(max-width: 700px) calc(100vw - 32px), 420px" />
                <span>Thanh toán tự động</span>
              </div>
              <div className={styles.packageBody}>
                <h2>{item.title}</h2>
                <strong>{item.price}</strong>
                <button type="button" className={styles.packageDetail} onClick={() => setSelectedPackage(item)}><Info aria-hidden="true" /> Chi tiết</button>
                <Link href="/login?redirect=/goi-hoc-tap">Đăng kí ngay</Link>
              </div>
            </article>
          ))}
        </div>
      </div>
      {selectedPackage ? (
        <Modal title={`Chi tiết ${selectedPackage.title}`} onClose={() => setSelectedPackage(null)}>
          <div className={styles.packageModalContent}>
            <span>GÓI HỌC TẬP</span>
            <h2>{selectedPackage.title}</h2>
            <p>{selectedPackage.description}</p>
            <strong>{selectedPackage.price}</strong>
            <Link href="/login?redirect=/goi-hoc-tap">Đăng kí ngay <ArrowRight aria-hidden="true" /></Link>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

function EvidenceRegistrationPage() {
  return (
    <main className={styles.evidencePage}>
      <div className={styles.evidenceInner}>
        <header>
          <h1>Đăng ký minh chứng</h1>
          <p>Đăng ký tham gia và gửi minh chứng.</p>
        </header>
        <article className={styles.evidenceCard}>
          <div>
            <h2>Đăng ký Thi thử TSA 2027 - Đợt 1</h2>
            <span>Chờ duyệt</span>
          </div>
          <strong>Minh chứng Facebook</strong>
          <p>Đăng nhập để đăng ký và gửi minh chứng trên tài khoản của bạn.</p>
          <Link href="/login?redirect=/dang-ky-minh-chung">Đăng nhập để tiếp tục <ArrowRight aria-hidden="true" /></Link>
        </article>
      </div>
    </main>
  );
}

function ContentBlocks({ blocks }: { blocks: ContentBlock[] }) {
  return blocks.map((block, index) => {
    if (block.tag === "ul" || block.tag === "ol") {
      const List = block.tag;
      return (
        <List key={`${block.tag}-${index}`}>
          {(block.items ?? [block.text]).map((item) => <li key={item}>{item}</li>)}
        </List>
      );
    }
    if (block.tag === "div") return <aside className={styles.contentCallout} key={`callout-${index}`}><Info aria-hidden="true" /><p>{block.text}</p></aside>;
    return <p key={`p-${index}`}>{block.text}</p>;
  });
}

function RelatedReading({ currentSlug, legal = false }: { currentSlug: string; legal?: boolean }) {
  if (legal) {
    const other = currentSlug === "dieu-khoan-dich-vu" ? "chinh-sach-bao-mat" : "dieu-khoan-dich-vu";
    return (
      <section className={styles.relatedReading}>
        <h2>ĐỌC TIẾP</h2>
        <Link href={`/${other}`}><span>{other === "chinh-sach-bao-mat" ? "BẢO MẬT" : "THÔNG TIN"}</span><strong>{other === "chinh-sach-bao-mat" ? "Chính sách bảo mật" : "Điều khoản dịch vụ"}</strong></Link>
      </section>
    );
  }
  const related = publicArticleCards.filter((article) => article.slug !== currentSlug).slice(0, 2);
  return (
    <section className={styles.relatedReading}>
      <h2>ĐỌC TIẾP</h2>
      <div>{related.map((article) => <ArticlePreviewCard key={article.slug} article={article} compact />)}</div>
    </section>
  );
}

function ArticlePage({ document }: { document: ArticleDocument }) {
  const faq = document.sections.find((section) => section.faq?.length);
  return (
    <>
      <main className={styles.contentPage}>
        <header className={styles.contentHero}>
          <nav aria-label="Đường dẫn"><Link href="/">Trang chủ</Link><span>/</span><span>{document.eyebrow}</span></nav>
          <h1>{document.title}</h1>
          <p>{document.intro}</p>
        </header>
        <article className={styles.contentArticle}>
          <nav className={styles.tableOfContents} aria-label="Nội dung chính">
            <strong>NỘI DUNG CHÍNH</strong>
            <ol>{document.toc.map((item) => <li key={item.href}><a href={item.href}>{item.label}</a></li>)}</ol>
          </nav>
          {document.sections.filter((section) => !section.faq).map((section) => (
            <section id={section.id} key={section.id}>
              <h2>{section.title}</h2>
              {section.blocks ? <ContentBlocks blocks={section.blocks} /> : null}
            </section>
          ))}
          {faq ? (
            <section id={faq.id} className={styles.faqSection}>
              <h2>{faq.title}</h2>
              {faq.faq?.map((item) => (
                <details key={item.question}>
                  <summary>{item.question}<ChevronDown aria-hidden="true" /></summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </section>
          ) : null}
          {document.references ? (
            <section className={styles.references} aria-labelledby="reference-title">
              <h2 id="reference-title">NGUỒN THAM KHẢO</h2>
              {document.references.links?.map((link) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />{link.label}</a>)}
              {document.references.note ? <p>{document.references.note}</p> : null}
            </section>
          ) : null}
          <section className={styles.articleCta}>
            <h2>Luyện đề {document.eyebrow.includes("HSA") ? "HSA" : "TSA"} bám sát cấu trúc thật</h2>
            <p>Kho đề được biên soạn theo đúng ba phần thi và các mức độ tư duy, phòng luyện mô phỏng trải nghiệm thi trên máy.</p>
            <div><Link href={`/exam-room?examType=${document.eyebrow.includes("HSA") ? "HSA" : "TSA"}`}>Xem gói học tập <ArrowRight aria-hidden="true" /></Link><a href="https://www.facebook.com/aeck.edu.vn" target="_blank" rel="noreferrer">Hỏi qua Fanpage</a></div>
          </section>
          <RelatedReading currentSlug={document.slug} />
        </article>
      </main>
      <CompactFooter />
    </>
  );
}

function LegalPage({ document }: { document: LegalDocument }) {
  return (
    <>
      <main className={`${styles.contentPage} ${styles.legalPage}`}>
        <header className={styles.contentHero}>
          <nav aria-label="Đường dẫn"><Link href="/">Trang chủ</Link><span>/</span><span>{document.title.replace(" dịch vụ", "")}</span></nav>
          <h1>{document.title}</h1>
          <strong>CẬP NHẬT LẦN CUỐI: 28/08/2026</strong>
          <p>{legalLead[document.slug]}</p>
        </header>
        <article className={styles.contentArticle}>
          <nav className={styles.tableOfContents} aria-label="Nội dung chính">
            <strong>NỘI DUNG CHÍNH</strong>
            <ol>{document.toc.map((item) => <li key={item.href}><a href={item.href}>{item.label}</a></li>)}</ol>
          </nav>
          {document.sections.map((section) => (
            <section id={section.id} key={section.id}>
              <h2>{section.title}</h2>
              {section.blocks ? <ContentBlocks blocks={section.blocks} /> : null}
            </section>
          ))}
          <aside className={styles.supportBox}>
            <strong>Cần hỗ trợ thêm?</strong>
            <p><a href="mailto:hotro@aeck.vn">hotro@aeck.vn</a><span aria-hidden="true">·</span><a href="tel:0776362944">0776 362 944</a></p>
          </aside>
          <RelatedReading currentSlug={document.slug} legal />
        </article>
      </main>
      <CompactFooter />
    </>
  );
}

function PublicPageBody({ route }: { route: AeckPublicRoute }) {
  if (route === "home") return <HomePage />;
  if (route === "giao-vien") return <TeachersPage />;
  if (route === "goi-hoc-tap") return <PackagesPage />;
  if (route === "dang-ky-minh-chung") return <EvidenceRegistrationPage />;
  const article = articleBySlug[route];
  if (article) return <ArticlePage document={article} />;
  const legal = legalBySlug[route];
  if (legal) return <LegalPage document={legal} />;
  return null;
}

export function handlePublicArrowNavigation(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("a[href],button:not([disabled])"));
  const current = items.indexOf(document.activeElement as HTMLElement);
  if (current < 0) return;
  event.preventDefault();
  const delta = event.key === "ArrowRight" ? 1 : -1;
  items[(current + delta + items.length) % items.length]?.focus();
}

export default function AeckPublicSite({ route = "home" }: { route?: AeckPublicRoute }) {
  return (
    <div className={styles.site}>
      <SiteHeader route={route} />
      <PublicPageBody route={route} />
      <FloatingContacts />
    </div>
  );
}
