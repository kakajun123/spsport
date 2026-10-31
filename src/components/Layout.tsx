import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";
import { isDemo } from "../lib/supabaseClient";
import { useDemoVenue } from "../context/DemoVenueContext";
import { venueConfigs, getVenueConfig } from "../lib/venueConfig";
import LanguageSwitcher from "./LanguageSwitcher";
import Mark from "./Mark";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, profile, signOut, demoRole, setDemoRole } = useAuth();
  const { venue, setVenue } = useDemoVenue();
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const isStaff = profile?.role === "admin" || profile?.role === "front_desk";

  return (
    <div className="min-h-screen">
      <a href="#main" className="skip-link">{locale === "zh" ? "跳到主要内容" : "Skip to content"}</a>
      <header className="site-header">
        <div className="site-header-inner">
          <Link to="/" className="wordmark" aria-label={t("app.name")}>
            <Mark size={26} />
            <span className="text-[17px] font-semibold tracking-tight">{t("app.name")}</span>
          </Link>
          <button type="button" className="menu-toggle secondary-button" aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen(!menuOpen)}>{locale === "zh" ? "菜单" : "Menu"}</button>
          <nav id="main-nav" aria-label={locale === "zh" ? "主导航" : "Main navigation"} className={`main-nav ${menuOpen ? "is-open" : ""}`} onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setMenuOpen(false); }}>
            <NavLink to="/" className={({ isActive }) => (isActive ? "text-ink" : "text-muted hover:text-ink")}>{t("nav.book")}</NavLink>
            <NavLink to="/courses" className={({ isActive }) => (isActive ? "text-ink" : "text-muted hover:text-ink")}>{t("nav.courses")}</NavLink>
            {user && (
              <>
                <NavLink to="/my-bookings" className={({ isActive }) => (isActive ? "text-ink" : "text-muted hover:text-ink")}>
                  {t("nav.myBookings")}
                </NavLink>
                <NavLink to="/account" className={({ isActive }) => (isActive ? "text-ink" : "text-muted hover:text-ink")}>
                  {t("nav.account")}
                </NavLink>
              </>
            )}
            {isStaff && (
              <NavLink to="/admin" className={({ isActive }) => (isActive ? "text-ink" : "text-muted hover:text-ink")}>
                {t("nav.admin")}
              </NavLink>
            )}
            <LanguageSwitcher />
            {user ? (
              <button type="button"
                onClick={async () => {
                  await signOut();
                  navigate("/");
                }}
                className="secondary-button"
              >
                {t("nav.logout")}
              </button>
            ) : (
              <Link
                to="/login"
                className="secondary-button"
              >
                {t("nav.login")}
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* 演示模式：客户 / 会员 / 管理员 视角切换 */}
      {isDemo() && (
        <div className="demo-toolbar">
          <div className="demo-toolbar-inner">
            <span className="font-medium">{t("demo.preview")}</span>
            {(["guest", "member", "admin"] as const).map((r) => (
              <button type="button"
                key={r}
                onClick={() => setDemoRole(r)}
                aria-pressed={demoRole === r}
                className="demo-option"
              >
                {r === "guest" ? t("demo.guest") : r === "member" ? t("demo.member") : t("demo.admin")}
              </button>
            ))}
            <span className="ml-3 font-medium">{t("demo.venue")}</span>
            {Object.keys(venueConfigs).map((v) => (
              <button type="button"
                key={v}
                onClick={() => setVenue(v)}
                aria-pressed={venue === v}
                className="demo-option"
              >
                {locale === "zh" ? getVenueConfig(v).name_zh : getVenueConfig(v).name_en}
              </button>
            ))}
          </div>
        </div>
      )}

      <main id="main" tabIndex={-1} className="app-main">{children}</main>
    </div>
  );
}
