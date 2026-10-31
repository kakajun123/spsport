import { Fragment, useEffect, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import {
  cancelClassSession,
  createClassSession,
  enrollStaff,
  fmtMoney,
  getClassSessions,
  getCourses,
  getMembers,
  getSessionEnrollments,
  getUnits,
  markAttendance,
  upsertCourse,
} from "../../lib/api";
import { addMinutes, fmtMelbourneFull, melbourneToUtc, melbourneToday } from "../../lib/time";
import type { ClassSession, Course, Enrollment, Profile, ResourceUnit } from "../../lib/types";

const pad = (n: number) => String(n).padStart(2, "0");
function todayStr() {
  const d = melbourneToday();
  return `${d.y}-${pad(d.m + 1)}-${pad(d.d)}`;
}

export default function AdminCourses() {
  const { t, locale } = useLocale();
  const [courses, setCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [units, setUnits] = useState<ResourceUnit[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const emptyCourse = {
    id: "", name_en: "", name_zh: "", coach_name: "", description: "",
    price: 25, capacity: 6, active: true,
  };
  const [cf, setCf] = useState(emptyCourse);
  const [sf, setSf] = useState({
    course_id: "", unit_id: "", date: todayStr(), time: "19:00",
    duration: 60, coach: "", capacity: 6, price: 25,
  });

  const [openId, setOpenId] = useState<string | null>(null);
  const [enrMap, setEnrMap] = useState<Record<string, Enrollment[]>>({});
  const [guest, setGuest] = useState({ member_id: "", name: "", email: "", channel: "cash" });

  async function load() {
    setCourses(await getCourses());
    setSessions(await getClassSessions());
    setUnits(await getUnits());
    setMembers(await getMembers());
  }
  useEffect(() => { load(); }, []);

  async function saveCourse() {
    if (!cf.name_en || !cf.name_zh) { setMsg("name required"); return; }
    const { error } = await upsertCourse({
      id: cf.id || undefined,
      name_en: cf.name_en, name_zh: cf.name_zh, coach_name: cf.coach_name,
      description: cf.description, price: Number(cf.price), capacity: Number(cf.capacity),
      active: cf.active,
    });
    setMsg(error ? error.message : "OK");
    if (!error) { setCf(emptyCourse); load(); }
  }

  async function saveSession() {
    if (!sf.course_id || !sf.unit_id) { setMsg("course & court required"); return; }
    const [y, m, d] = sf.date.split("-").map(Number);
    const [h, min] = sf.time.split(":").map(Number);
    const start = melbourneToUtc(y, m - 1, d, h, min);
    const end = addMinutes(start, Number(sf.duration));
    const { error } = await createClassSession({
      course_id: sf.course_id, unit_id: sf.unit_id,
      start_time: start.toISOString(), end_time: end.toISOString(),
      coach_name: sf.coach, capacity: Number(sf.capacity), price: Number(sf.price),
    });
    setMsg(error ? error.message : "OK");
    if (!error) load();
  }

  async function toggleOpen(id: string) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    setEnrMap((m) => ({ ...m, [id]: m[id] ?? [] }));
    const list = await getSessionEnrollments(id);
    setEnrMap((m) => ({ ...m, [id]: list }));
  }

  async function doAttendance(id: string, status: string) {
    const { error } = await markAttendance(id, status);
    setMsg(error ? error.message : "OK");
    if (openId) { const list = await getSessionEnrollments(openId); setEnrMap((m) => ({ ...m, [openId]: list })); }
  }

  async function doCancelSession(id: string) {
    const { error } = await cancelClassSession(id);
    setMsg(error ? error.message : "OK");
    if (!error) load();
  }

  async function doAddStudent(sessionId: string) {
    const memberId = guest.member_id || null;
    if (!memberId && !guest.name) { setMsg(t("course.guestName") + " " + t("common.required")); return; }
    const { error } = await enrollStaff({
      session_id: sessionId,
      member_id: memberId,
      guest_name: memberId ? "" : guest.name,
      guest_email: memberId ? "" : guest.email,
      guest_phone: "",
      channel: guest.channel,
      paid: true,
    });
    setMsg(error ? error.message : "OK");
    if (!error) {
      setGuest({ member_id: "", name: "", email: "", channel: "cash" });
      const list = await getSessionEnrollments(sessionId);
      setEnrMap((m) => ({ ...m, [sessionId]: list }));
    }
  }

  const badmintonUnits = units.filter((u) => u.resource?.category === "badminton" && !u.resource?.is_addon);

  return (
    <div className="space-y-8">
      <h1 className="text-[24px] font-semibold tracking-tight">{t("admin.courses")}</h1>
      {msg && <p className="text-[13px] text-muted">{msg}</p>}

      {/* 课程 */}
      <section>
        <h2 className="mb-3 text-[16px] font-medium">{t("course.create")}</h2>
        <div className="space-y-3 rounded-lg border border-gray-200 bg-surface p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input className="rounded-control border px-2 py-1.5 text-[13px]" placeholder="Name EN" value={cf.name_en} onChange={(e) => setCf({ ...cf, name_en: e.target.value })} />
            <input className="rounded-control border px-2 py-1.5 text-[13px]" placeholder="名称 中文" value={cf.name_zh} onChange={(e) => setCf({ ...cf, name_zh: e.target.value })} />
            <input className="rounded-control border px-2 py-1.5 text-[13px]" placeholder={t("course.coach")} value={cf.coach_name} onChange={(e) => setCf({ ...cf, coach_name: e.target.value })} />
            <input className="rounded-control border px-2 py-1.5 text-[13px]" placeholder="Description" value={cf.description} onChange={(e) => setCf({ ...cf, description: e.target.value })} />
            <input type="number" className="rounded-control border px-2 py-1.5 text-[13px]" placeholder={t("course.price")} value={cf.price} onChange={(e) => setCf({ ...cf, price: Number(e.target.value) })} />
            <input type="number" className="rounded-control border px-2 py-1.5 text-[13px]" placeholder={t("course.capacity")} value={cf.capacity} onChange={(e) => setCf({ ...cf, capacity: Number(e.target.value) })} />
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={cf.active} onChange={(e) => setCf({ ...cf, active: e.target.checked })} /> {t("res.active")}
            </label>
          </div>
          <button onClick={saveCourse} className="rounded-control bg-brand px-4 py-2 text-[13px] text-white hover:bg-brand-ink">
            {t("common.save")}
          </button>
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-surface">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-muted">
                <th className="px-3 py-2 font-normal">EN</th>
                <th className="px-3 py-2 font-normal">中文</th>
                <th className="px-3 py-2 font-normal">{t("course.coach")}</th>
                <th className="px-3 py-2 text-right font-normal">{t("course.price")}</th>
                <th className="px-3 py-2 text-right font-normal">{t("course.capacity")}</th>
                <th className="px-3 py-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">{c.name_en}</td>
                  <td className="px-3 py-2">{c.name_zh}</td>
                  <td className="px-3 py-2">{c.coach_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(c.price)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.capacity}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setCf({ id: c.id, name_en: c.name_en, name_zh: c.name_zh, coach_name: c.coach_name ?? "", description: c.description ?? "", price: c.price, capacity: c.capacity, active: c.active })}
                      className="text-[12px] text-brand underline"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 排课 */}
      <section>
        <h2 className="mb-3 text-[16px] font-medium">{t("course.schedule")}</h2>
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-surface p-4 sm:grid-cols-4 lg:grid-cols-6">
          <select className="rounded-control border px-2 py-1.5 text-[13px]" value={sf.course_id} onChange={(e) => setSf({ ...sf, course_id: e.target.value })}>
            <option value="">Course…</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{locale === "zh" ? c.name_zh : c.name_en}</option>)}
          </select>
          <select className="rounded-control border px-2 py-1.5 text-[13px]" value={sf.unit_id} onChange={(e) => setSf({ ...sf, unit_id: e.target.value })}>
            <option value="">Court…</option>
            {badmintonUnits.map((u) => <option key={u.id} value={u.id}>{locale === "zh" ? u.label_zh : u.label_en}</option>)}
          </select>
          <input type="date" className="rounded-control border px-2 py-1.5 text-[13px]" value={sf.date} onChange={(e) => setSf({ ...sf, date: e.target.value })} />
          <input type="time" className="rounded-control border px-2 py-1.5 text-[13px]" value={sf.time} onChange={(e) => setSf({ ...sf, time: e.target.value })} />
          <select className="rounded-control border px-2 py-1.5 text-[13px]" value={sf.duration} onChange={(e) => setSf({ ...sf, duration: Number(e.target.value) })}>
            {[30, 60, 90, 120].map((n) => <option key={n} value={n}>{n} min</option>)}
          </select>
          <input className="rounded-control border px-2 py-1.5 text-[13px]" placeholder={t("course.coach")} value={sf.coach} onChange={(e) => setSf({ ...sf, coach: e.target.value })} />
          <input type="number" className="rounded-control border px-2 py-1.5 text-[13px]" placeholder={t("course.capacity")} value={sf.capacity} onChange={(e) => setSf({ ...sf, capacity: Number(e.target.value) })} />
          <input type="number" className="rounded-control border px-2 py-1.5 text-[13px]" placeholder={t("course.price")} value={sf.price} onChange={(e) => setSf({ ...sf, price: Number(e.target.value) })} />
          <button onClick={saveSession} className="rounded-control bg-brand px-4 py-2 text-[13px] text-white hover:bg-brand-ink">
            {t("course.schedule")}
          </button>
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-surface">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-muted">
                <th className="px-3 py-2 font-normal">{t("common.date")}</th>
                <th className="px-3 py-2 font-normal">Course</th>
                <th className="px-3 py-2 font-normal">Court</th>
                <th className="px-3 py-2 right font-normal">{t("course.enrolled")}</th>
                <th className="px-3 py-2 font-normal">{t("common.status")}</th>
                <th className="px-3 py-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const course = courses.find((c) => c.id === s.course_id);
                const unit = units.find((u) => u.id === s.unit_id);
                const list = enrMap[s.id] ?? [];
                const active = list.filter((e) => e.status === "enrolled" || e.status === "attended").length;
                return (
                  <Fragment key={s.id}>
                    <tr key={s.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 tabular-nums">{fmtMelbourneFull(s.start_time)}</td>
                      <td className="px-3 py-2">{course ? (locale === "zh" ? course.name_zh : course.name_en) : s.course_id}</td>
                      <td className="px-3 py-2">{unit ? (locale === "zh" ? unit.label_zh : unit.label_en) : ""}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{active}/{s.capacity}</td>
                      <td className="px-3 py-2 text-muted">{s.status}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button onClick={() => toggleOpen(s.id)} className="text-[12px] text-brand underline">{t("course.students")}</button>
                          {s.status === "scheduled" && (
                            <button onClick={() => doCancelSession(s.id)} className="text-[12px] text-negative underline">{t("course.cancelSession")}</button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {openId === s.id && (
                      <tr key={`${s.id}-open`}>
                        <td colSpan={6} className="bg-ground px-3 py-3">
                          <div className="space-y-3">
                            <table className="w-full text-[12px]">
                              <thead>
                                <tr className="text-left text-muted">
                                  <th className="py-1 font-normal">Student</th>
                                  <th className="py-1 font-normal">Channel</th>
                                  <th className="py-1 font-normal">Status</th>
                                  <th className="py-1 font-normal" />
                                </tr>
                              </thead>
                              <tbody>
                                {list.map((e) => (
                                  <tr key={e.id} className="border-t border-gray-100">
                                    <td className="py-1">{e.member_id ? members.find((m) => m.id === e.member_id)?.full_name ?? e.member_id : e.guest_name}</td>
                                    <td className="py-1 text-muted">{e.channel}</td>
                                    <td className="py-1">{e.status}</td>
                                    <td className="py-1">
                                      <div className="flex gap-2">
                                        <button onClick={() => doAttendance(e.id, "attended")} className="text-[11px] text-brand underline">{t("course.attended")}</button>
                                        <button onClick={() => doAttendance(e.id, "no_show")} className="text-[11px] text-negative underline">{t("course.noShow")}</button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {list.length === 0 && <tr><td colSpan={4} className="py-2 text-muted">{t("common.none")}</td></tr>}
                              </tbody>
                            </table>

                            <div className="flex flex-wrap items-center gap-2">
                              <select className="rounded-control border px-2 py-1 text-[12px]" value={guest.member_id} onChange={(e) => setGuest({ ...guest, member_id: e.target.value })}>
                                <option value="">{t("course.addStudent")} · {t("common.none")}</option>
                                {members.filter((m) => m.role === "member").map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
                              </select>
                              <input className="rounded-control border px-2 py-1 text-[12px]" placeholder={t("course.guestName")} value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} />
                              <input className="rounded-control border px-2 py-1 text-[12px]" placeholder={t("course.guestEmail")} value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
                              <select className="rounded-control border px-2 py-1 text-[12px]" value={guest.channel} onChange={(e) => setGuest({ ...guest, channel: e.target.value })}>
                                <option value="cash">{t("channel.cash")}</option>
                                <option value="card">{t("channel.card")}</option>
                                <option value="member_balance">{t("channel.member_balance")}</option>
                              </select>
                              <button onClick={() => doAddStudent(s.id)} className="rounded-control bg-brand px-3 py-1 text-[12px] text-white hover:bg-brand-ink">{t("course.addStudent")}</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
