import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";
import { enrollMember, fmtMoney, getMyEnrollments, getUpcomingSessions } from "../lib/api";
import { fmtMelbourneFull } from "../lib/time";
import type { UpcomingSession } from "../lib/types";

export default function Courses() {
  const { user } = useAuth();
  const { t, locale } = useLocale();
  const [sessions, setSessions] = useState<UpcomingSession[]>([]);
  const [enrolled, setEnrolled] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const list = await getUpcomingSessions();
    setSessions(list);
    if (user) {
      const mine = await getMyEnrollments(user.id);
      setEnrolled(new Set(mine.filter((e) => e.status !== "cancelled").map((e) => e.session_id)));
    } else {
      setEnrolled(new Set());
    }
  }

  useEffect(() => {
    load();
  }, [user]);

  async function enroll(s: UpcomingSession) {
    if (!user) {
      setMsg({ ok: false, text: t("course.loginToEnroll") });
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await enrollMember(s.id);
    if (error) setMsg({ ok: false, text: error.message });
    else {
      setMsg({ ok: true, text: t("book.success") });
      await load();
    }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight sm:text-[28px]">{t("course.title")}</h1>
        <p className="mt-1 text-[14px] text-muted">{t("course.subtitle")}</p>
      </div>

      {msg && (
        <div className={`rounded-lg p-3 text-[14px] ${msg.ok ? "bg-brand-soft text-brand-ink" : "bg-red-50 text-negative"}`}>
          {msg.text}
        </div>
      )}

      {sessions.length === 0 && <p className="text-[14px] text-muted">{t("course.empty")}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sessions.map((s) => {
          const name = locale === "zh" ? s.course_name_zh : s.course_name_en;
          const court = locale === "zh" ? s.unit_label_zh : s.unit_label_en;
          const full = s.enrolled_count >= s.capacity;
          const isEnrolled = enrolled.has(s.id);
          return (
            <div key={s.id} className="rounded-lg border border-gray-200 bg-surface p-4">
              <p className="text-[16px] font-semibold">{name}</p>
              <p className="text-[13px] text-muted">{s.coach_name}</p>
              <p className="mt-2 text-[13px] font-medium tabular-nums">{fmtMelbourneFull(s.start_time)}</p>
              <p className="text-[12px] text-muted">
                {court} · {t("course.enrolled")} <span className="tabular-nums">{s.enrolled_count}/{s.capacity}</span>
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[16px] font-semibold text-brand tabular-nums">{fmtMoney(s.price)}</span>
                {isEnrolled ? (
                  <span className="rounded-control bg-brand-soft px-3 py-1.5 text-[13px] text-brand-ink">{t("course.enrolledBtn")}</span>
                ) : full ? (
                  <span className="text-[13px] text-muted">{t("course.full")}</span>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => enroll(s)}
                    className="rounded-control bg-brand px-3 py-1.5 text-[13px] text-white hover:bg-brand-ink disabled:opacity-50"
                  >
                    {t("course.enroll")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!user && (
        <p className="text-[13px] text-muted">
          {t("course.loginToEnroll")} — <a href="/login" className="text-brand underline">{t("nav.login")}</a>
        </p>
      )}
    </div>
  );
}
