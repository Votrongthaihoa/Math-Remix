import { BadgeCheck, Mail, ShieldCheck, UserRound } from "lucide-react";

import { useAuthStore } from "../../store/auth-store.ts";

export default function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  if (!user) return null;
  return (
    <div className="aeck-page-stack">
      <header className="aeck-page-heading"><h1>Hồ sơ</h1><p>Thông tin tài khoản đang được sử dụng trên AECK.</p></header>
      <section className="aeck-profile-card">
        <div className="aeck-profile-avatar"><UserRound aria-hidden="true" /></div>
        <div className="aeck-profile-name"><h2>{user.username}</h2><p>{user.studentCode ?? user.id}</p></div>
        <dl>
          <div><dt><Mail aria-hidden="true" />Email</dt><dd>{user.email}</dd></div>
          <div><dt><BadgeCheck aria-hidden="true" />Mã tài khoản</dt><dd>{user.studentCode ?? user.id}</dd></div>
          <div><dt><ShieldCheck aria-hidden="true" />Vai trò</dt><dd>{user.role === "admin" ? "Quản trị viên" : user.role === "ctv" ? "Cộng tác viên" : "Học sinh"}</dd></div>
        </dl>
      </section>
    </div>
  );
}
