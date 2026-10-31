// 演示数据：本地预览 UI 时使用（不开 Supabase 也能看到完整界面）
// 场馆本身由 venues/<id>.json 定义，这里只放"示例数据"（会员/订单/课程等）
import type {
  Booking,
  BusinessHours,
  ClassSession,
  Course,
  Enrollment,
  Order,
  Profile,
  Resource,
  ResourceUnit,
  TopupTier,
  Transaction,
  UpcomingSession,
} from "./types";
import { melbourneToUtc, toMelbourneDay } from "./time";
import { buildResourcesAndUnits, getVenueConfig } from "./venueConfig";

// ---------- 演示场馆（可通过 VITE_VENUE / ?venue= 指定） ----------
function resolveInitialVenue(): string {
  const fromQuery =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("venue")
      : null;
  const fromEnv = (import.meta.env.VITE_VENUE as string | undefined) || null;
  const fromStorage =
    typeof window !== "undefined" ? window.localStorage.getItem("demo-venue") : null;
  return fromQuery || fromStorage || fromEnv || "spsport";
}

let currentVenue = resolveInitialVenue();
export function setDemoVenue(v: string) { currentVenue = v; }
export function getDemoVenue(): string { return currentVenue; }
export function getDemoResources(): Resource[] {
  return buildResourcesAndUnits(getVenueConfig(currentVenue)).resources;
}

// 后台开关某个场地（演示模式存在内存里）
const disabledUnits = new Set<string>();
export function setDemoUnitActive(id: string, active: boolean) {
  if (active) disabledUnits.delete(id);
  else disabledUnits.add(id);
}
export function getDemoUnits(): ResourceUnit[] {
  return buildResourcesAndUnits(getVenueConfig(currentVenue)).units.map((u) => ({
    ...u,
    active: u.active && !disabledUnits.has(u.id),
  }));
}

// ---------- 设置 ----------
export const demoSettings: Record<string, unknown> = {
  business_hours: { default: { open: "09:00", close: "23:00" } } as BusinessHours,
  cancellation_window_hours: 2,
  no_show_penalty: { mode: "full" },
  topup_tiers: [
    { amount: 50, bonus: 0, variantId: "" },
    { amount: 100, bonus: 10, variantId: "" },
    { amount: 200, bonus: 25, variantId: "" },
  ] as TopupTier[],
  default_locale: "en",
  peak_pricing: {
    peak_multiplier: 1.3,
    weekday_peak: { start: "18:00", end: "22:00" },
    weekend_peak: { start: "09:00", end: "22:00" },
  },
};

// 每个演示场馆的设置独立保存在内存，刷新页面重置。
const settingOverrides = new Map<string, Record<string, unknown>>();
export function getDemoSetting<T>(key: string, fallback: T): T {
  const override = settingOverrides.get(currentVenue);
  if (override && key in override) return override[key] as T;
  if (key === "peak_pricing") return (getVenueConfig(currentVenue).pricing ?? fallback) as T;
  return (demoSettings[key] as T) ?? fallback;
}
export function setDemoSetting(key: string, value: unknown) {
  settingOverrides.set(currentVenue, { ...settingOverrides.get(currentVenue), [key]: value });
}

// ---------- 当日占用（按当前场馆的单元生成） ----------
export function demoDayBookings(dayStartISO: string): Booking[] {
  const units = getDemoUnits();
  const day = toMelbourneDay(dayStartISO);
  const slot = (h: number, min: number) => melbourneToUtc(day.y, day.m, day.d, h, min).toISOString();
  const courts = units.filter((u) => u.resource?.category === "badminton" && !u.resource?.is_addon);
  const others = units.filter((u) => u.resource?.category !== "badminton" && !u.resource?.is_addon);
  const out: Booking[] = [];
  if (courts[0]) out.push({ id: "b1", order_id: "o-demo", unit_id: courts[0].id, start_time: slot(14, 0), end_time: slot(15, 30), status: "booked", price: 18 });
  if (courts[1]) out.push({ id: "b2", order_id: "o-demo", unit_id: courts[1].id, start_time: slot(18, 0), end_time: slot(19, 0), status: "booked", price: 12 });
  if (others[0]) out.push({ id: "b3", order_id: "o-demo", unit_id: others[0].id, start_time: slot(16, 0), end_time: slot(17, 0), status: "booked", price: 12 });
  return out;
}

// ---------- 会员 / 订单 / 交易 ----------
export const demoProfile: Profile = {
  id: "demo-admin",
  email: "admin@example.com",
  full_name: "Demo admin",
  phone: null,
  role: "admin",
  balance: 120.5,
  locale: "en",
  created_at: new Date().toISOString(),
};

export const demoMembers: Profile[] = [
  demoProfile,
  { id: "m1", email: "member001@example.com", full_name: "Demo member 001", phone: null, role: "member", balance: 240.0, locale: "zh", created_at: "2026-10-01T00:00:00Z" },
  { id: "m2", email: "staff002@example.com", full_name: "Demo staff 002", phone: null, role: "front_desk", balance: 0, locale: "en", created_at: "2026-10-05T00:00:00Z" },
];

export const demoOrders: Order[] = [
  { id: "o1", customer_id: "m1", created_by: "m1", channel: "member_balance", status: "confirmed", total: 36, paid_at: new Date().toISOString(), shopify_order_id: null, created_at: new Date().toISOString() },
  { id: "o2", customer_id: null, created_by: "demo-admin", channel: "cash", status: "completed", total: 15, paid_at: new Date().toISOString(), shopify_order_id: null, created_at: new Date().toISOString() },
  { id: "o3", customer_id: "m2", created_by: "m2", channel: "card", status: "no_show", total: 20, paid_at: new Date().toISOString(), shopify_order_id: null, created_at: new Date().toISOString() },
];

export const demoTransactions: Transaction[] = [
  { id: "t1", member_id: "demo-admin", type: "topup", amount: 100, balance_after: 120.5, order_id: null, note: "demo topup", created_at: new Date().toISOString() },
  { id: "t2", member_id: "demo-admin", type: "deduct", amount: -24, balance_after: 96.5, order_id: "o1", note: "booking", created_at: new Date().toISOString() },
];

// ---------- 团课演示数据 ----------
export const demoCourses: Course[] = [
  { id: "c1", name_en: "Badminton Beginners", name_zh: "羽毛球入门班", coach_name: "Demo coach 001", description: "基本步法与高远球，适合零基础。", price: 25, capacity: 6, active: true, sort_order: 1 },
  { id: "c2", name_en: "Billiards Clinic", name_zh: "台球提高班", coach_name: "Demo coach 002", description: "走位、加塞与实战套路。", price: 30, capacity: 4, active: true, sort_order: 2 },
];

function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function setHM(d: Date, h: number, m: number) { const x = new Date(d); x.setHours(h, m, 0, 0); return x; }

export function demoClassSessions(): ClassSession[] {
  const units = getDemoUnits();
  const courts = units.filter((u) => u.resource?.category === "badminton" && !u.resource?.is_addon);
  const base = new Date();
  const mk = (i: number, h: number, dur: number, courseId: string, unitId: string): ClassSession => {
    const start = setHM(addDays(base, i), h, 0);
    const end = new Date(start.getTime() + dur * 60000);
    return {
      id: `cs${i}-${h}`,
      course_id: courseId,
      unit_id: unitId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      coach_name: courseId === "c1" ? "Demo coach 001" : "Demo coach 002",
      capacity: courseId === "c1" ? 6 : 4,
      price: courseId === "c1" ? 25 : 30,
      status: "scheduled",
      booking_id: null,
    };
  };
  const out: ClassSession[] = [];
  if (courts[0]) out.push(mk(1, 19, 60, "c1", courts[0].id));
  if (courts[1]) out.push(mk(2, 18, 90, "c1", courts[1].id));
  const third = courts[2] ?? courts[0];
  if (third) out.push(mk(3, 20, 60, "c2", third.id));
  return out;
}

export function demoUpcomingSessions(): UpcomingSession[] {
  return demoClassSessions().map((s, i) => {
    const course = demoCourses.find((c) => c.id === s.course_id)!;
    const unit = getDemoUnits().find((u) => u.id === s.unit_id);
    return {
      id: s.id,
      course_id: s.course_id,
      course_name_en: course.name_en,
      course_name_zh: course.name_zh,
      coach_name: s.coach_name,
      unit_id: s.unit_id,
      unit_label_en: unit?.label_en ?? "",
      unit_label_zh: unit?.label_zh ?? "",
      start_time: s.start_time,
      end_time: s.end_time,
      capacity: s.capacity,
      price: s.price,
      enrolled_count: i === 0 ? 3 : i === 1 ? 2 : 1,
      status: s.status,
    };
  });
}

export const demoEnrollments: Enrollment[] = [
  { id: "e1", session_id: "cs1-19", member_id: "m1", guest_name: null, guest_email: null, guest_phone: null, status: "enrolled", price: 25, channel: "member_balance", paid: true, created_at: new Date().toISOString() },
  { id: "e2", session_id: "cs1-19", member_id: null, guest_name: "Demo guest 001", guest_email: "guest001@example.com", guest_phone: null, status: "enrolled", price: 25, channel: "cash", paid: true, created_at: new Date().toISOString() },
];
