export type Locale = "en" | "zh";
export type Role = "member" | "front_desk" | "admin";
export type OrderStatus =
  | "pending_payment"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";
export type BookingStatus = "booked" | "cancelled" | "completed" | "no_show";
export type Channel = "member_balance" | "shopify" | "cash" | "card";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: Role;
  balance: number;
  locale: Locale;
  created_at: string;
}

export interface Resource {
  id: string;
  key: string;
  name_en: string;
  name_zh: string;
  category: string;
  price_member: number;
  price_non_member: number;
  is_addon: boolean;
  addon_for: string | null;
  active: boolean;
  sort_order: number;
}

export interface ResourceUnit {
  id: string;
  resource_id: string;
  label_en: string;
  label_zh: string;
  active: boolean;
  sort_order: number;
  resource?: Resource;
}

// Public availability intentionally excludes booking IDs, order IDs and prices.
export interface BookingAvailability {
  unit_id: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
}

export interface Booking {
  id: string;
  order_id: string;
  unit_id: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  price: number;
}

export interface Order {
  id: string;
  customer_id: string | null;
  created_by: string | null;
  channel: Channel;
  status: OrderStatus;
  total: number;
  paid_at: string | null;
  shopify_order_id: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  member_id: string;
  type: "topup" | "deduct" | "refund" | "adjust";
  amount: number;
  balance_after: number;
  order_id: string | null;
  note: string | null;
  created_at: string;
}

export interface BusinessHours {
  default: { open: string; close: string };
  [weekday: string]: { open: string; close: string };
}

export interface TopupTier {
  amount: number;
  bonus: number;
  variantId: string;
}

// ---------- 团课 ----------
export interface Course {
  id: string;
  name_en: string;
  name_zh: string;
  coach_name: string | null;
  description: string | null;
  price: number;
  capacity: number;
  active: boolean;
  sort_order: number;
}

export interface ClassSession {
  id: string;
  course_id: string;
  unit_id: string;
  start_time: string;
  end_time: string;
  coach_name: string | null;
  capacity: number;
  price: number;
  status: "scheduled" | "cancelled" | "completed";
  booking_id: string | null;
}

export interface UpcomingSession {
  id: string;
  course_id: string;
  course_name_en: string;
  course_name_zh: string;
  coach_name: string | null;
  unit_id: string;
  unit_label_en: string;
  unit_label_zh: string;
  start_time: string;
  end_time: string;
  capacity: number;
  price: number;
  enrolled_count: number;
  status: string;
}

export interface Enrollment {
  id: string;
  session_id: string;
  member_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  status: "enrolled" | "attended" | "no_show" | "cancelled";
  price: number;
  channel: string;
  paid: boolean;
  created_at: string;
}
