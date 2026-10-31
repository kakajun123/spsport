import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";
import { useDemoVenue } from "../context/DemoVenueContext";
import { isDemo } from "../lib/supabaseClient";
import { createBookingCartBalance, createCheckout, fmtMoney, getClassAvailability, type ClassAvailability, getDayBookings, getSetting, getUnits } from "../lib/api";
import { addMelbourneDays, addMinutes, fmtMelbourne, melbourneDayStartUtc, melbourneToUtc, melbourneToday, type MDY } from "../lib/time";
import { slotPrice, isPeak, type PeakPricing } from "../lib/pricing";
import type { BookingAvailability, BusinessHours, ResourceUnit } from "../lib/types";

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export default function Home() {
  const { user, profile, refreshProfile } = useAuth();
  const { t, locale } = useLocale();
  const { venue } = useDemoVenue();
  const zh = locale === "zh";
  const [units, setUnits] = useState<ResourceUnit[]>([]);
  const [hours, setHours] = useState<BusinessHours>({ default: { open: "09:00", close: "23:00" } });
  const [pricing, setPricing] = useState<PeakPricing | null>(null);
  const [dayBookings, setDayBookings] = useState<BookingAvailability[]>([]);
  const [classes, setClasses] = useState<ClassAvailability[]>([]);
  const [day, setDay] = useState<MDY>(melbourneToday());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [withMachine, setWithMachine] = useState(false);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestName, setGuestName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [clock, setClock] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setSelectedIds([]);
    setSelectedCells(new Set());
    setWithMachine(false);
    setMsg(null);
  }, [venue, user?.id]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError(false);
    setMsg(null);
    const start = melbourneDayStartUtc(day).toISOString();
    const end = melbourneDayStartUtc(addMelbourneDays(day, 1)).toISOString();
    Promise.all([
      getUnits(),
      getSetting<BusinessHours>("business_hours", { default: { open: "09:00", close: "23:00" } }),
      getSetting<PeakPricing | null>("peak_pricing", null),
      getDayBookings(start, end),
      getClassAvailability(start, end),
    ]).then(([nextUnits, nextHours, nextPricing, bookings, sessions]) => {
      if (!current) return;
      setUnits(nextUnits.filter((u) => u.resource?.active));
      setHours(nextHours);
      setPricing(nextPricing);
      setDayBookings(bookings);
      setClasses(sessions);
    }).catch(() => { if (current) setLoadError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [day, venue, reload]);

  const dates = useMemo(() => Array.from({ length: 14 }, (_, i) => addMelbourneDays(melbourneToday(), i)), []);
  const dayHours = hours[WEEKDAYS[new Date(day.y, day.m, day.d).getDay()]] ?? hours.default;
  const slotTimes = useMemo(() => {
    const [oh, om] = dayHours.open.split(":").map(Number);
    const [ch, cm] = dayHours.close.split(":").map(Number);
    const out: Date[] = [];
    let cur = melbourneToUtc(day.y, day.m, day.d, oh, om);
    const close = melbourneToUtc(day.y, day.m, day.d, ch, cm);
    while (addMinutes(cur, 30) <= close && out.length < 48) {
      out.push(new Date(cur));
      cur = addMinutes(cur, 30);
    }
    return out;
  }, [dayHours, day]);

  const unitById = (id: string) => units.find((u) => u.id === id);
  const labelOf = (u: ResourceUnit) => zh ? u.label_zh : u.label_en;
  const isMember = !!user;
  const priceOf = (u: ResourceUnit, time: Date) => slotPrice(u.resource!.price_member, u.resource!.price_non_member, isMember, time, pricing);
  const badmintonUnits = units.filter((u) => u.resource?.category === "badminton" && !u.resource?.is_addon);
  const billiardUnits = units.filter((u) => u.resource?.category !== "badminton" && !u.resource?.is_addon);
  const machineUnit = units.find((u) => u.resource?.is_addon);
  const selectedUnits = selectedIds.map(unitById).filter((u): u is ResourceUnit => !!u);
  const hasBadmintonSelected = selectedUnits.some((u) => u.resource?.category === "badminton");
  const boardUnits = [...selectedUnits, ...(withMachine && machineUnit && hasBadmintonSelected ? [machineUnit] : [])];
  const keyOf = (id: string, tm: Date) => `${id}|${tm.toISOString()}`;
  const bookedAt = (id: string, tm: Date) => dayBookings.some((b) => b.unit_id === id && new Date(b.start_time) < addMinutes(tm, 30) && new Date(b.end_time) > tm);
  const isClassOccupied = (id: string, tm: Date) => classes.some((s) => s.unit_id === id && s.status === "scheduled" && new Date(s.start_time) < addMinutes(tm, 30) && new Date(s.end_time) > tm);

  function toggleTile(id: string) {
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    setSelectedIds(next);
    const hasCourt = badmintonUnits.some((u) => next.includes(u.id));
    if (!hasCourt) setWithMachine(false);
    setSelectedCells((cs) => new Set([...cs].filter((k) => {
      const [uid, iso] = k.split("|");
      return next.includes(uid) || (uid === machineUnit?.id && badmintonUnits.some((u) => next.includes(u.id) && cs.has(`${u.id}|${iso}`)));
    })));
    setMsg(null);
  }
  function toggleMachine() {
    if (!hasBadmintonSelected) return;
    setWithMachine(!withMachine);
    if (withMachine && machineUnit) setSelectedCells((cs) => new Set([...cs].filter((k) => !k.startsWith(machineUnit.id + "|"))));
  }
  function toggleCell(id: string, tm: Date) {
    if (busy || loading || loadError || tm.getTime() <= Date.now() || bookedAt(id, tm) || isClassOccupied(id, tm)) return;
    const next = new Set(selectedCells);
    const key = keyOf(id, tm);
    if (next.has(key)) next.delete(key);
    else {
      if (unitById(id)?.resource?.is_addon && !badmintonUnits.some((u) => next.has(keyOf(u.id, tm)))) {
        setMsg({ ok: false, text: t("book.machineNeedsCourt") });
        return;
      }
      next.add(key);
    }
    for (const k of [...next]) {
      const [uid, iso] = k.split("|");
      if (unitById(uid)?.resource?.is_addon && !badmintonUnits.some((u) => next.has(`${u.id}|${iso}`))) next.delete(k);
    }
    setSelectedCells(next);
    setMsg(null);
  }
  function buildLines() {
    const lines: { unit_id: string; start_time: string; end_time: string }[] = [];
    for (const u of boardUnits) {
      for (const tm of slotTimes) {
        if (!selectedCells.has(keyOf(u.id, tm))) continue;
        const last = lines[lines.length - 1];
        if (last?.unit_id === u.id && last.end_time === tm.toISOString()) last.end_time = addMinutes(tm, 30).toISOString();
        else lines.push({ unit_id: u.id, start_time: tm.toISOString(), end_time: addMinutes(tm, 30).toISOString() });
      }
    }
    return lines;
  }
  const selectedCount = selectedCells.size;
  const total = [...selectedCells].reduce((sum, k) => {
    const [id, iso] = k.split("|");
    const u = unitById(id);
    return sum + (u ? priceOf(u, new Date(iso)) : 0);
  }, 0);
  const selectionExpired = [...selectedCells].some((k) => new Date(k.split("|")[1]).getTime() <= clock);
  function validateMachine() {
    return [...selectedCells].every((k) => {
      const [id, iso] = k.split("|");
      return !unitById(id)?.resource?.is_addon || badmintonUnits.some((u) => selectedCells.has(`${u.id}|${iso}`));
    });
  }
  function reset() { setSelectedIds([]); setSelectedCells(new Set()); setWithMachine(false); }
  async function refreshDay() {
    setDayBookings(await getDayBookings(melbourneDayStartUtc(day).toISOString(), melbourneDayStartUtc(addMelbourneDays(day, 1)).toISOString()));
  }
  function canSubmit() {
    if (busy || loading || loadError || !selectedCount) return false;
    if ([...selectedCells].some((k) => new Date(k.split("|")[1]).getTime() <= Date.now())) {
      setMsg({ ok: false, text: zh ? "选中的时段已开始，请重新选择。" : "A selected time has started. Please choose again." });
      return false;
    }
    if (!validateMachine()) { setMsg({ ok: false, text: t("book.machineNeedsCourt") }); return false; }
    return true;
  }
  const demoMessage = zh ? "演示已完成：没有扣款，也没有保存预订。" : "Preview complete. No payment was taken and no booking was saved.";
  async function book() {
    if (!canSubmit()) return;
    setBusy(true); setMsg(null);
    try {
      if (isDemo()) { setMsg({ ok: true, text: demoMessage }); return; }
      const { error } = await createBookingCartBalance(buildLines());
      if (error) throw error;
      reset();
      setMsg({ ok: true, text: t("book.success") });
      try { await Promise.all([refreshDay(), refreshProfile()]); }
      catch { setMsg({ ok: true, text: zh ? "预订已完成，页面刷新失败。请在我的预订中核对。" : "Booking saved. Refresh failed; check My bookings." }); }
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(false); }
  }
  async function bookShopify() {
    if (!canSubmit()) return;
    setBusy(true); setMsg(null);
    try {
      if (isDemo()) { setMsg({ ok: true, text: demoMessage }); return; }
      const res = await createCheckout({ kind: "booking", lines: buildLines().map((l) => ({ unitId: l.unit_id, start: l.start_time, end: l.end_time })), email: guestEmail.trim(), name: guestName.trim() });
      if (res.error || !res.checkoutUrl) throw new Error(res.error || (zh ? "未能创建付款链接，请重试。" : "No checkout link was returned. Please retry."));
      setMsg({ ok: true, text: t("book.redirecting") });
      window.location.href = res.checkoutUrl;
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(false); }
  }
  const dayLabel = new Date(day.y, day.m, day.d).toLocaleDateString(zh ? "zh-CN" : "en-AU", { weekday: "short", month: "short", day: "numeric" });
  const disabled = busy || loading || loadError || !selectedCount || selectionExpired;

  function courtChoices(list: ResourceUnit[]) {
    return <div className="court-choices">{list.map((u) => <button type="button" key={u.id} disabled={busy || loading} onClick={() => toggleTile(u.id)} aria-pressed={selectedIds.includes(u.id)} className="court-choice">
      <span className="choice-check" aria-hidden="true">{selectedIds.includes(u.id) ? "✓" : "+"}</span>
      <span><strong>{labelOf(u)}</strong><small>{fmtMoney(isMember ? u.resource!.price_member : u.resource!.price_non_member)} / {zh ? "30 分钟起" : "30 min base"}</small></span>
    </button>)}</div>;
  }

  return <div className="booking-page">
    <div className="booking-heading"><div><h1>{t("book.title")}</h1><p>{zh ? "选好场地和时间，一页完成预订。" : "Your court, your time. Book in one place."}</p></div><span className="venue-timezone">{zh ? "墨尔本时间" : "Melbourne time"}<br />{dayHours.open} / {dayHours.close}</span></div>
    <section className="date-section" aria-labelledby="date-heading">
      <div className="section-heading"><h2 id="date-heading">{t("book.selectDate")}</h2><span>{dayLabel}</span></div>
      <div className="date-rail" aria-label={t("book.selectDate")}>
        {dates.map((d) => {
          const date = new Date(d.y, d.m, d.d);
          const selected = d.y === day.y && d.m === day.m && d.d === day.d;
          return <button type="button" key={`${d.y}-${d.m}-${d.d}`} disabled={busy} aria-pressed={selected} aria-label={date.toLocaleDateString(zh ? "zh-CN" : "en-AU", { weekday: "long", month: "long", day: "numeric" })} onClick={() => { setDay(d); setSelectedCells(new Set()); }} className="date-choice">
            <span>{date.toLocaleDateString(zh ? "zh-CN" : "en-AU", { weekday: "short" })}</span><strong>{d.d}</strong><span>{date.toLocaleDateString(zh ? "zh-CN" : "en-AU", { month: "short" })}</span>
          </button>;
        })}
      </div>
    </section>
    <div className="booking-workspace" aria-busy={loading}>
      <section className="court-picker" aria-labelledby="court-heading">
        <div className="section-heading"><h2 id="court-heading">{zh ? "选择场地" : "Choose a court"}</h2><span>{zh ? "可多选" : "Select multiple"}</span></div>
        {loading && <p role="status" className="state-message">{zh ? "正在读取场地和价格…" : "Loading courts and prices…"}</p>}
        {!loading && !loadError && <>
          {badmintonUnits.length > 0 && <><h3>{t("venue.badminton")}</h3>{courtChoices(badmintonUnits)}</>}
          {billiardUnits.length > 0 && <><h3>{t("venue.billiards")}</h3>{courtChoices(billiardUnits)}</>}
          {!units.length && <p className="state-message">{zh ? "暂无开放场地，请联系前台。" : "No courts are open. Please contact reception."}</p>}
          {machineUnit && <label className="addon-choice"><input type="checkbox" checked={withMachine} onChange={toggleMachine} disabled={!hasBadmintonSelected || busy} /><span>{t("book.addMachine")}<small>{zh ? "需同时选择羽毛球场的时段" : "Choose a matching badminton time"}</small></span></label>}
        </>}
      </section>
      <section className="time-picker" aria-labelledby="time-heading">
        <div className="section-heading"><h2 id="time-heading">{t("book.selectTime")}</h2><span>{zh ? "每格 30 分钟" : "30 minutes per slot"}</span></div>
        {loadError ? <div className="state-message" role="alert"><p>{zh ? "无法读取场地状态，请重试。" : "Could not load availability. Please retry."}</p><button type="button" className="secondary-button" onClick={() => setReload((n) => n + 1)}>{zh ? "重新加载" : "Try again"}</button></div>
          : loading ? <div className="slot-skeleton" role="status">{zh ? "正在核对可预订时段…" : "Checking availability…"}</div>
          : !selectedIds.length ? <div className="empty-board"><span aria-hidden="true" className="court-symbol">＋</span><h3>{zh ? "先选一片喜欢的场地" : "Start with your court"}</h3><p>{zh ? "这里会显示可选时间，也可以同时预订多片场地。" : "Available times will appear here. You can book several courts together."}</p></div>
          : <>
            <div className="slot-legend"><span><i className="legend-free" />{t("book.freeSlots")}</span><span><i className="legend-selected" />{t("book.selected")}</span><span><i className="legend-booked" />{t("book.booked")}</span><span>{zh ? "高峰时段标有价格" : "Peak prices shown on slots"}</span></div>
            {boardUnits.map((u) => <div key={u.id} className="unit-schedule"><h3>{labelOf(u)}</h3><div className="slot-grid">{slotTimes.map((tm) => {
              const booked = bookedAt(u.id, tm); const isClass = isClassOccupied(u.id, tm); const past = tm.getTime() <= clock;
              const selected = selectedCells.has(keyOf(u.id, tm)); const peak = isPeak(tm, pricing);
              const state = past ? (zh ? "已过时" : "Past") : isClass ? t("book.class") : booked ? t("book.booked") : selected ? t("book.selected") : t("book.freeSlots");
              return <button type="button" key={tm.toISOString()} disabled={busy || past || booked || isClass} onClick={() => toggleCell(u.id, tm)} aria-pressed={selected} aria-label={`${labelOf(u)} ${fmtMelbourne(tm)} ${state} ${fmtMoney(priceOf(u, tm))}`} className={`time-slot ${peak ? "is-peak" : ""}`} title={`${state}, ${fmtMoney(priceOf(u, tm))}`}>
                <strong>{selected ? "✓ " : ""}{fmtMelbourne(tm)}</strong><span>{past || isClass || booked ? state : `${fmtMoney(priceOf(u, tm))}${peak ? (zh ? " 高峰" : " peak") : ""}`}</span>
              </button>;
            })}</div>{!slotTimes.length && <p>{zh ? "当天没有开放时段。" : "No opening hours for this date."}</p>}</div>)}
          </>}
      </section>
    </div>
    <section id="booking-summary" className="booking-summary" aria-labelledby="summary-heading">
      <div className="summary-details"><h2 id="summary-heading">{zh ? "你的预订" : "Your booking"}</h2>
        {selectedCount ? <ul>{buildLines().map((line) => <li key={`${line.unit_id}-${line.start_time}`}><strong>{labelOf(unitById(line.unit_id)!)}</strong><span>{dayLabel}, {fmtMelbourne(line.start_time)} / {fmtMelbourne(line.end_time)}</span></li>)}</ul> : <p className="muted">{zh ? "选择一个时段，即可查看费用。" : "Select a time to see your total."}</p>}
        <div className="summary-price" aria-live="polite" aria-atomic="true"><span>{t("book.total")} <small>AUD</small></span><strong key={total} className="price-update">{fmtMoney(total)}</strong></div>
        {selectedCount > 0 && <button type="button" className="text-button" disabled={busy} onClick={reset}>{zh ? "清空选择" : "Clear selection"}</button>}
      </div>
      <div className="summary-action">
        {selectionExpired && <p role="alert" className="feedback error">{zh ? "部分时段已开始，请清空并重新选择。" : "A selected time has started. Clear your selection and choose again."}</p>}
        {msg && <p role={msg.ok ? "status" : "alert"} className={`feedback ${msg.ok ? "success" : "error"}`}>{msg.text}</p>}
        {user ? <><p className="muted">{zh ? "可用余额" : "Available balance"} {fmtMoney(profile?.balance ?? 0)}</p><button type="button" disabled={disabled} aria-busy={busy} onClick={book} className="primary-button">{busy ? (zh ? "正在预订…" : "Booking…") : t("book.payWithBalance")}</button></>
        : <form onSubmit={(e) => { e.preventDefault(); void bookShopify(); }}>
          <div className="guest-fields"><label>{t("book.guestEmail")}<input name="email" type="email" autoComplete="email" required value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="you@example.com" disabled={busy} /></label><label>{t("book.guestName")}<input name="name" autoComplete="name" value={guestName} onChange={(e) => setGuestName(e.target.value)} disabled={busy} /></label></div>
          <button type="submit" disabled={disabled} aria-busy={busy} className="primary-button">{busy ? (zh ? "正在创建付款…" : "Preparing checkout…") : t("book.payShopify")}</button>
          <p className="muted">{t("book.loginToBook")} <Link to="/login">{t("nav.login")}</Link></p>
        </form>}
        {isDemo() && <p className="demo-note">{zh ? "演示预览，不会扣款或保存订单。" : "Demo preview. Payments and bookings are not saved."}</p>}
      </div>
    </section>
    {selectedCount > 0 && <div className="mobile-booking-bar"><span>{selectedCount} {zh ? "个时段" : "slots"}<strong>{fmtMoney(total)}</strong></span><a href="#booking-summary" className="primary-button">{zh ? "查看并预订" : "Review booking"}</a></div>}
  </div>;
}
