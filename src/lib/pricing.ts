import { toZonedTime } from "date-fns-tz";
import { TZ } from "./time";

export interface PeakWindow {
  start: string; // "18:00"
  end: string;   // "22:00"
}

export interface PeakPricing {
  peak_multiplier: number;
  weekday_peak?: PeakWindow;
  weekend_peak?: PeakWindow;
}

/** 某个时刻是否属于高峰时段（按墨尔本时间、工作日/周末分开） */
export function isPeak(date: Date, cfg: PeakPricing | null): boolean {
  if (!cfg) return false;
  const d = toZonedTime(date, TZ);
  const dow = d.getDay(); // 0 = Sun, 6 = Sat
  const win = dow === 0 || dow === 6 ? cfg.weekend_peak : cfg.weekday_peak;
  if (!win) return false;

  const [sh, sm] = win.start.split(":").map(Number);
  const [eh, em] = win.end.split(":").map(Number);
  const mins = d.getHours() * 60 + d.getMinutes();
  return mins >= sh * 60 + sm && mins < eh * 60 + em;
}

/** 单个 30 分钟时段的价格（高峰自动乘倍数） */
export function slotPrice(
  priceMember: number,
  priceNonMember: number,
  member: boolean,
  date: Date,
  cfg: PeakPricing | null
): number {
  const base = member ? priceMember : priceNonMember;
  return cfg && isPeak(date, cfg) ? base * Number(cfg.peak_multiplier) : base;
}
