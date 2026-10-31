import { supabase, isDemo } from "./supabaseClient";
import { createPayment, type CheckoutPayload } from "./payment";
import {
  demoClassSessions,
  demoCourses,
  demoDayBookings,
  demoEnrollments,
  demoMembers,
  demoOrders,
  getDemoSetting,
  setDemoSetting,
  demoTransactions,
  demoUpcomingSessions,
  getDemoResources,
  getDemoUnits,
  setDemoUnitActive,
} from "./demo";
import type {
  Booking,
  BookingAvailability,
  ClassSession,
  Course,
  Enrollment,
  Order,
  Profile,
  Resource,
  ResourceUnit,
  Transaction,
  UpcomingSession,
} from "./types";

export const fmtMoney = (n: number) => `$${Number(n).toFixed(2)}`;

// ---------- 设置 ----------
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  if (isDemo()) return getDemoSetting(key, fallback);
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return (data?.value as T) ?? fallback;
}

// ---------- 资源 ----------
export async function getResources(): Promise<Resource[]> {
  if (isDemo()) return getDemoResources();
  const { data } = await supabase
    .from("resources")
    .select("*")
    .order("sort_order");
  return (data as Resource[]) ?? [];
}

export async function getUnits(): Promise<ResourceUnit[]> {
  if (isDemo()) return getDemoUnits().filter((u) => u.active);
  const { data, error } = await supabase
    .from("resource_units")
    .select("*, resource:resources(*)")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return (data as ResourceUnit[]) ?? [];
}

// 后台用：包含已下架的场地
export async function getAllUnits(): Promise<ResourceUnit[]> {
  if (isDemo()) return getDemoUnits();
  const { data } = await supabase
    .from("resource_units")
    .select("*, resource:resources(*)")
    .order("sort_order");
  return (data as ResourceUnit[]) ?? [];
}

export async function setUnitActive(id: string, active: boolean) {
  if (isDemo()) {
    setDemoUnitActive(id, active);
    return { data: null, error: null };
  }
  return supabase.from("resource_units").update({ active }).eq("id", id);
}

// ---------- 可用性 ----------
export async function getDayBookings(
  dayStartISO: string,
  dayEndISO: string
): Promise<BookingAvailability[]> {
  if (isDemo()) return demoDayBookings(dayStartISO).map(({ unit_id, start_time, end_time, status }) => ({ unit_id, start_time, end_time, status }));
  const { data, error } = await supabase.rpc("get_booking_availability", {
    p_start: dayStartISO,
    p_end: dayEndISO,
  });
  if (error) throw error;
  return (data as BookingAvailability[]) ?? [];
}

export type ClassAvailability = Pick<ClassSession, "unit_id" | "start_time" | "end_time" | "status">;
export async function getClassAvailability(start: string, end: string): Promise<ClassAvailability[]> {
  if (isDemo()) return demoClassSessions().filter((s) => s.start_time < end && s.end_time > start)
    .map(({ unit_id, start_time, end_time, status }) => ({ unit_id, start_time, end_time, status }));
  const { data, error } = await supabase.rpc("get_class_availability", { p_start: start, p_end: end });
  if (error) throw error;
  return data ?? [];
}

const fakeRpc = async () => ({ data: null, error: null });

// ---------- 预订 RPC ----------
export async function createBookingBalance(
  unitIds: string[],
  startISO: string,
  endISO: string
) {
  if (isDemo()) return fakeRpc();
  return supabase.rpc("create_booking_balance", {
    p_unit_ids: unitIds,
    p_start: startISO,
    p_end: endISO,
  });
}

export interface CartLine {
  unit_id: string;
  start_time: string;
  end_time: string;
}

export async function createBookingCartBalance(lines: CartLine[]) {
  if (isDemo()) return fakeRpc();
  return supabase.rpc("create_booking_balance_cart", { p_lines: lines });
}

export async function createBookingCartStaff(
  customerId: string | null,
  lines: CartLine[],
  channel: string,
  paid: boolean
) {
  if (isDemo()) return fakeRpc();
  return supabase.rpc("create_booking_staff_cart", {
    p_customer_id: customerId,
    p_lines: lines,
    p_channel: channel,
    p_paid: paid,
  });
}

export async function createBookingStaff(params: {
  customerId: string | null;
  unitIds: string[];
  startISO: string;
  endISO: string;
  channel: string;
  paid: boolean;
}) {
  if (isDemo()) return fakeRpc();
  return supabase.rpc("create_booking_staff", {
    p_customer_id: params.customerId,
    p_unit_ids: params.unitIds,
    p_start: params.startISO,
    p_end: params.endISO,
    p_channel: params.channel,
    p_paid: params.paid,
  });
}

export async function cancelOrder(orderId: string, refund: boolean) {
  if (isDemo()) return fakeRpc();
  return supabase.rpc("cancel_order", { p_order_id: orderId, p_refund: refund });
}
export async function markNoShow(orderId: string) {
  if (isDemo()) return fakeRpc();
  return supabase.rpc("mark_no_show", { p_order_id: orderId });
}
export async function completeOrder(orderId: string) {
  if (isDemo()) return fakeRpc();
  return supabase.rpc("complete_order", { p_order_id: orderId });
}

// ---------- 会员 / 账本 ----------
export async function creditBalance(memberId: string, amount: number, note?: string) {
  if (isDemo()) return fakeRpc();
  return supabase.rpc("credit_balance", {
    p_member_id: memberId,
    p_amount: amount,
    p_note: note ?? "manual topup",
    p_shopify_order_id: null,
  });
}
export async function adminAdjustBalance(memberId: string, amount: number, note?: string) {
  if (isDemo()) return fakeRpc();
  return supabase.rpc("admin_adjust_balance", {
    p_member_id: memberId,
    p_amount: amount,
    p_note: note,
  });
}

// ---------- 管理 ----------
export async function updateResource(
  id: string,
  v: { name_en: string; name_zh: string; price_member: number; price_non_member: number; active: boolean }
) {
  if (isDemo()) return fakeRpc();
  return supabase.rpc("update_resource", {
    p_resource_id: id,
    p_name_en: v.name_en,
    p_name_zh: v.name_zh,
    p_price_member: v.price_member,
    p_price_non_member: v.price_non_member,
    p_active: v.active,
  });
}
export async function upsertSetting(key: string, value: unknown) {
  if (isDemo()) { setDemoSetting(key, value); return fakeRpc(); }
  return supabase.rpc("upsert_setting", { p_key: key, p_value: value });
}
export async function setRole(userId: string, role: string) {
  if (isDemo()) return fakeRpc();
  return supabase.rpc("set_role", { p_user_id: userId, p_role: role });
}

// ---------- 查询列表 ----------
export async function getMembers(): Promise<Profile[]> {
  if (isDemo()) return demoMembers;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as Profile[]) ?? [];
}

export async function getOrders(range?: { from: string; to: string }) {
  if (isDemo()) return demoOrders;
  let q = supabase
    .from("orders")
    .select("*, customer:profiles(full_name, email)")
    .order("created_at", { ascending: false });
  if (range) q = q.gte("created_at", range.from).lte("created_at", range.to);
  const { data } = await q;
  return data ?? [];
}

export async function getMyOrders(uid: string) {
  if (isDemo()) return demoOrders;
  const { data } = await supabase
    .from("orders")
    .select("*")
    .or(`customer_id.eq.${uid},created_by.eq.${uid}`)
    .order("created_at", { ascending: false });
  return (data as Order[]) ?? [];
}

export async function getMyBookings(uid: string) {
  if (isDemo()) {
    const now = Date.now();
    return [
      {
        id: "db1",
        start_time: new Date(now + 3600e3).toISOString(),
        end_time: new Date(now + 5400e3).toISOString(),
        status: "booked",
        price: 12,
        unit: { label_en: "Court 1", label_zh: "场地 1", resource: { name_en: "Badminton Court", name_zh: "羽毛球场" } },
        order: { status: "confirmed", channel: "member_balance", total: 12 },
      },
      {
        id: "db2",
        start_time: new Date(now - 86400e3).toISOString(),
        end_time: new Date(now - 86400e3 + 3600e3).toISOString(),
        status: "completed",
        price: 10,
        unit: { label_en: "Table 1", label_zh: "台 1", resource: { name_en: "Billiards Table", name_zh: "台球桌" } },
        order: { status: "completed", channel: "cash", total: 10 },
      },
    ];
  }
  const { data } = await supabase
    .from("bookings")
    .select("*, unit:resource_units(label_en,label_zh,resource_id, resource:resources(name_en,name_zh)), order:orders!inner(status,channel,total)")
    .or(`customer_id.eq.${uid},created_by.eq.${uid}`, { referencedTable: "orders" })
    .order("start_time", { ascending: false });
  return data ?? [];
}

export async function getMyTransactions(uid: string): Promise<Transaction[]> {
  if (isDemo()) return demoTransactions;
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("member_id", uid)
    .order("created_at", { ascending: false });
  return (data as Transaction[]) ?? [];
}

// ---------- 付款（Shopify 或 Stripe，由 VITE_PAYMENT_PROVIDER 决定） ----------
export async function createCheckout(payload: CheckoutPayload) {
  if (isDemo()) return { checkoutUrl: null };
  return createPayment(payload);
}

// ---------- 团课 ----------
export async function getCourses(): Promise<Course[]> {
  if (isDemo()) return demoCourses;
  const { data } = await supabase.from("courses").select("*").order("sort_order");
  return (data as Course[]) ?? [];
}

export async function upsertCourse(v: {
  id?: string;
  name_en: string;
  name_zh: string;
  coach_name: string;
  description: string;
  price: number;
  capacity: number;
  active: boolean;
}) {
  if (isDemo()) return { data: null, error: null };
  return supabase.rpc("upsert_course", {
    p_id: v.id ?? null,
    p_name_en: v.name_en,
    p_name_zh: v.name_zh,
    p_coach: v.coach_name,
    p_desc: v.description,
    p_price: v.price,
    p_capacity: v.capacity,
    p_active: v.active,
  });
}

export async function getUpcomingSessions(): Promise<UpcomingSession[]> {
  if (isDemo()) return demoUpcomingSessions();
  const { data } = await supabase.rpc("get_upcoming_sessions");
  return (data as UpcomingSession[]) ?? [];
}

export async function getClassSessions(): Promise<ClassSession[]> {
  if (isDemo()) return demoClassSessions();
  const { data, error } = await supabase
    .from("class_sessions")
    .select("*")
    .order("start_time", { ascending: false });
  if (error) throw error;
  return (data as ClassSession[]) ?? [];
}

export async function createClassSession(p: {
  course_id: string;
  unit_id: string;
  start_time: string;
  end_time: string;
  coach_name: string;
  capacity: number;
  price: number;
}) {
  if (isDemo()) return { data: null, error: null };
  return supabase.rpc("create_class_session", {
    p_course_id: p.course_id,
    p_unit_id: p.unit_id,
    p_start: p.start_time,
    p_end: p.end_time,
    p_coach: p.coach_name,
    p_capacity: p.capacity,
    p_price: p.price,
  });
}

export async function cancelClassSession(id: string) {
  if (isDemo()) return { data: null, error: null };
  return supabase.rpc("cancel_class_session", { p_session_id: id });
}

export async function getSessionEnrollments(sessionId: string): Promise<Enrollment[]> {
  if (isDemo()) return demoEnrollments.filter((e) => e.session_id === sessionId);
  const { data } = await supabase
    .from("enrollments")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at");
  return (data as Enrollment[]) ?? [];
}

export async function enrollMember(sessionId: string) {
  if (isDemo()) return { data: null, error: null };
  return supabase.rpc("enroll_member", { p_session_id: sessionId });
}

export async function enrollStaff(p: {
  session_id: string;
  member_id: string | null;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  channel: string;
  paid: boolean;
}) {
  if (isDemo()) return { data: null, error: null };
  return supabase.rpc("enroll_staff", {
    p_session_id: p.session_id,
    p_member_id: p.member_id,
    p_guest_name: p.guest_name,
    p_guest_email: p.guest_email,
    p_guest_phone: p.guest_phone,
    p_channel: p.channel,
    p_paid: p.paid,
  });
}

export async function markAttendance(enrollmentId: string, status: string) {
  if (isDemo()) return { data: null, error: null };
  return supabase.rpc("mark_attendance", { p_enrollment_id: enrollmentId, p_status: status });
}

export async function cancelEnrollment(id: string) {
  if (isDemo()) return { data: null, error: null };
  return supabase.rpc("cancel_enrollment", { p_enrollment_id: id });
}

export async function getMyEnrollments(uid: string): Promise<Enrollment[]> {
  if (isDemo()) return demoEnrollments.filter((e) => e.member_id === uid);
  const { data } = await supabase
    .from("enrollments")
    .select("*")
    .eq("member_id", uid)
    .order("created_at", { ascending: false });
  return (data as Enrollment[]) ?? [];
}
