import { NavLink, Outlet, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useLocale } from "../../context/LocaleContext";
import Mark from "../../components/Mark";

export default function AdminLayout() {
  const { profile } = useAuth();
  const { t } = useLocale();
  const isAdmin = profile?.role === "admin";

  const links = [
    { to: "/admin", end: true, label: t("admin.dashboard") },
    { to: "/admin/bookings", label: t("admin.bookings") },
    { to: "/admin/courses", label: t("admin.courses") },
    ...(isAdmin ? [{ to: "/admin/members", label: t("admin.members") }] : []),
    ...(isAdmin ? [{ to: "/admin/resources", label: t("admin.resources") }] : []),
    ...(isAdmin ? [{ to: "/admin/settings", label: t("admin.settings") }] : []),
  ];

  return (
    <div className="-mx-4 flex min-h-[calc(100vh-57px)] -my-6">
      {/* 侧边栏：tinted ground + 1px rule（T-frame） */}
      <aside className="hidden w-[230px] shrink-0 border-r border-gray-200 bg-ground md:flex md:flex-col">
        <div className="flex items-center gap-2 px-5 py-5">
          <Mark size={26} />
          <span className="text-[16px] font-semibold tracking-tight">{t("app.name")}</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `block rounded-control px-3 py-2 text-[14px] ${
                  isActive ? "bg-brand-soft font-medium text-brand-ink" : "text-muted hover:bg-raised hover:text-ink"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-gray-200 px-5 py-4 text-[12px] text-muted">
          {profile?.full_name || profile?.email}
        </div>
      </aside>

      {/* 手机：顶部横向导航 */}
      <div className="min-w-0 flex-1">
        <div className="flex gap-1 overflow-x-auto border-b border-gray-200 bg-surface px-3 md:hidden">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `whitespace-nowrap px-3 py-2.5 text-[14px] ${isActive ? "border-b-2 border-brand text-brand-ink" : "text-muted"}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </div>
        <div className="p-4 md:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
