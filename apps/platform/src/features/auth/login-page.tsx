import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { signInWithPassword } from "../../api/auth-api.ts";
import { homePathForRole } from "../../app/access-policy.ts";
import { useAuthStore } from "../../store/auth-store.ts";
import "../../styles/auth.css";

export function LoginPage() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const login = useAuthStore((state) => state.login);
  const location = useLocation();
  const navigate = useNavigate();
  const adminLogin = location.pathname.startsWith("/admin/");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const signupEnabled = import.meta.env.VITE_PUBLIC_SIGNUP_ENABLED === "true";

  if (isAuthenticated && user) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const session = await signInWithPassword(
        email.trim(),
        password,
        adminLogin ? "admin" : "student",
      );
      if (adminLogin && session.user.role === "student") {
        throw new Error("Tài khoản này không có quyền truy cập trang quản trị.");
      }
      login(session.token, session.user);
      const requestedPath = (location.state as { returnTo?: string } | null)?.returnTo;
      navigate(requestedPath || homePathForRole(session.user.role), { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể đăng nhập lúc này.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="aeck-login-page">
      <section className="aeck-login-brand" aria-label="Giới thiệu AECK">
        <img src="/aeck-wordmark.svg" alt="AECK" width="210" height="49" />
        <h1>{adminLogin ? "Không gian quản trị" : "Học tập rõ ràng, tiến bộ mỗi ngày"}</h1>
        <p>
          {adminLogin
            ? "Theo dõi vận hành, nội dung và dữ liệu khảo thí trong một hệ thống thống nhất."
            : "Truy cập khóa học, phòng luyện và lịch sử học tập của bạn trên mọi thiết bị."}
        </p>
      </section>
      <section className="aeck-login-panel">
        <form onSubmit={submit} aria-busy={submitting}>
          <div className="aeck-login-heading">
            <img src="/aeck-mark.svg" alt="" width="42" height="46" />
            <div>
              <h2>Đăng nhập</h2>
              <p>{adminLogin ? "Dành cho quản trị viên và cộng tác viên" : "Tiếp tục vào tài khoản AECK"}</p>
            </div>
          </div>
          <label htmlFor="aeck-login-email">Email</label>
          <div className="aeck-input-wrap">
            <Mail aria-hidden="true" />
            <input
              id="aeck-login-email"
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
          <label htmlFor="aeck-login-password">Mật khẩu</label>
          <div className="aeck-input-wrap">
            <LockKeyhole aria-hidden="true" />
            <input
              id="aeck-login-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Nhập mật khẩu"
              minLength={8}
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
          {error ? <p className="aeck-login-error" role="alert">{error}</p> : null}
          <button className="aeck-login-submit" type="submit" disabled={submitting}>
            {submitting ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
          <div className="aeck-login-switch">
            <span>{adminLogin ? "Bạn là học sinh?" : "Bạn quản trị hệ thống?"}</span>
            <Link to={adminLogin ? "/login" : "/admin/login"}>
              {adminLogin ? "Đăng nhập học tập" : "Đăng nhập quản trị"}
            </Link>
          </div>
          {!adminLogin && signupEnabled ? (
            <div className="aeck-login-switch aeck-signup-switch">
              <span>Chưa có tài khoản?</span>
              <Link to="/signup">Tạo tài khoản học viên</Link>
            </div>
          ) : null}
        </form>
      </section>
    </main>
  );
}
