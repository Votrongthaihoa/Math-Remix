import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Link, Navigate } from "react-router-dom";

import { signUp } from "../../api/signup-api.ts";
import { resolveSignupConfig } from "./signup-config.ts";
import {
  TurnstileWidget,
  type TurnstileWidgetHandle,
} from "./turnstile-widget.tsx";
import "../../styles/auth.css";

const signupConfig = resolveSignupConfig({
  enabled: import.meta.env.VITE_PUBLIC_SIGNUP_ENABLED,
  previewCompiled: __AECK_PREVIEW_DATA__,
  siteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
});

export function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createdEmail, setCreatedEmail] = useState("");
  const confirmationRef = useRef<HTMLInputElement>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  useEffect(() => {
    document.title = "Tạo tài khoản | AECK";
  }, []);

  const updateToken = useCallback((token: string) => {
    setTurnstileToken(token);
    if (token) setVerificationError("");
  }, []);
  const reportTurnstileError = useCallback((message: string) => {
    setVerificationError(message);
  }, []);

  if (!signupConfig.enabled) return <Navigate to="/login" replace />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setVerificationError("");

    if (password !== passwordConfirmation) {
      setFormError("Nhập lại đúng mật khẩu đã chọn.");
      confirmationRef.current?.focus();
      return;
    }
    const token = signupConfig.mode === "preview"
      ? "preview-turnstile-token"
      : turnstileToken;
    if (!token) {
      setVerificationError("Hoàn tất xác minh chống spam để tạo tài khoản.");
      turnstileRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const result = await signUp({ fullName, email, password, turnstileToken: token });
      setCreatedEmail(result.email);
    } catch (reason) {
      setFormError(
        reason instanceof Error
          ? reason.message
          : "Không thể tạo tài khoản. Kiểm tra kết nối và thử lại.",
      );
    } finally {
      setSubmitting(false);
      if (signupConfig.mode === "turnstile") turnstileRef.current?.reset();
    }
  };

  return (
    <main className="aeck-login-page aeck-signup-page">
      <section className="aeck-login-brand" aria-label="Giới thiệu tài khoản AECK">
        <img src="/aeck-wordmark.svg" alt="AECK" width="210" height="49" />
        <h1>Một tài khoản cho toàn bộ hành trình học tập</h1>
        <p>
          Theo dõi khóa học, lịch học và kết quả trên cùng một không gian rõ ràng,
          nhất quán trên mọi thiết bị.
        </p>
        <ul className="aeck-signup-benefits">
          <li><CheckCircle2 aria-hidden="true" />Lưu tiến độ học tập</li>
          <li><CheckCircle2 aria-hidden="true" />Nhận lịch học và thông báo</li>
          <li><CheckCircle2 aria-hidden="true" />Bảo vệ phiên đăng nhập</li>
        </ul>
      </section>
      <section className="aeck-login-panel">
        {createdEmail ? (
          <div className="aeck-signup-success" role="status">
            <span aria-hidden="true"><Mail /></span>
            <h2>Kiểm tra email để xác nhận tài khoản</h2>
            <p>
              AECK đã gửi liên kết xác nhận tới <strong><bdi>{createdEmail}</bdi></strong>.
              Xác nhận email trước khi đăng nhập.
            </p>
            <Link className="aeck-login-submit" to="/login">Mở trang đăng nhập</Link>
          </div>
        ) : (
          <form onSubmit={submit} aria-busy={submitting} noValidate={false}>
            <div className="aeck-login-heading">
              <img src="/aeck-mark.svg" alt="" width="42" height="46" />
              <div>
                <h2>Tạo tài khoản</h2>
                <p>Điền thông tin để bắt đầu học trên AECK</p>
              </div>
            </div>

            <label htmlFor="aeck-signup-name">Họ và tên</label>
            <div className="aeck-input-wrap">
              <UserRound aria-hidden="true" />
              <input
                id="aeck-signup-name"
                name="name"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Nguyễn Minh Anh"
                maxLength={120}
                required
              />
            </div>

            <label htmlFor="aeck-signup-email">Email</label>
            <div className="aeck-input-wrap">
              <Mail aria-hidden="true" />
              <input
                id="aeck-signup-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="hocvien@example.vn"
                required
              />
            </div>

            <label htmlFor="aeck-signup-password">Mật khẩu</label>
            <div className="aeck-input-wrap">
              <LockKeyhole aria-hidden="true" />
              <input
                id="aeck-signup-password"
                name="new-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Ít nhất 8 ký tự"
                minLength={8}
                maxLength={128}
                aria-describedby="aeck-signup-password-hint"
                required
              />
              <button
                type="button"
                className="aeck-password-toggle"
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </button>
            </div>
            <p id="aeck-signup-password-hint" className="aeck-field-hint">
              Dùng ít nhất 8 ký tự và không chia sẻ mật khẩu.
            </p>

            <label htmlFor="aeck-signup-password-confirmation">Nhập lại mật khẩu</label>
            <div className="aeck-input-wrap">
              <LockKeyhole aria-hidden="true" />
              <input
                ref={confirmationRef}
                id="aeck-signup-password-confirmation"
                name="new-password-confirmation"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                placeholder="Nhập lại mật khẩu"
                minLength={8}
                maxLength={128}
                aria-invalid={Boolean(formError && password !== passwordConfirmation)}
                aria-describedby={formError ? "aeck-signup-error" : undefined}
                required
              />
            </div>

            <div className="aeck-verification-area">
              {signupConfig.mode === "preview" ? (
                <div className="aeck-preview-verification" role="status">
                  <ShieldCheck aria-hidden="true" />
                  <span>Xác minh bản xem trước đã sẵn sàng</span>
                </div>
              ) : signupConfig.mode === "turnstile" ? (
                <TurnstileWidget
                  ref={turnstileRef}
                  siteKey={signupConfig.siteKey}
                  onTokenChange={updateToken}
                  onUnavailable={reportTurnstileError}
                />
              ) : (
                <p className="aeck-login-error" role="alert">
                  Đăng ký chưa được cấu hình đầy đủ. Vui lòng quay lại sau.
                </p>
              )}
              <p className="aeck-verification-status" role="status">
                {verificationError}
              </p>
            </div>

            {formError ? (
              <p id="aeck-signup-error" className="aeck-login-error" role="alert">
                {formError}
              </p>
            ) : null}
            <button
              className="aeck-login-submit"
              type="submit"
              disabled={submitting || signupConfig.mode === "unavailable"}
            >
              {submitting ? "Đang tạo tài khoản…" : "Tạo tài khoản"}
            </button>
            <div className="aeck-login-switch">
              <span>Đã có tài khoản?</span>
              <Link to="/login">Mở trang đăng nhập</Link>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
