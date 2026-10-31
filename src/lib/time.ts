import { fromZonedTime, toZonedTime, formatInTimeZone } from "date-fns-tz";

// 场馆时区：澳大利亚墨尔本（AEST/AEDT，含夏令时自动切换）
export const TZ = "Australia/Melbourne";

export interface MDY {
  y: number;
  m: number; // 0-based 月
  d: number; // 日
}

// 墨尔本「墙钟时间」→ UTC Date（用于把用户选的日期+时间转成可存储的 UTC 时刻）
export function melbourneToUtc(y: number, m: number, d: number, h: number, min: number): Date {
  // 注意：fromZonedTime 读取 Date 的本地日历字段，因此用「本地构造器」设成目标墙钟
  const wall = new Date(y, m, d, h, min, 0, 0);
  return fromZonedTime(wall, TZ);
}

// UTC 时刻 → 墨尔本墙钟时间字符串（HH:mm）
export function fmtMelbourne(iso: string | Date, pattern = "HH:mm"): string {
  return formatInTimeZone(new Date(iso), TZ, pattern);
}

export function fmtMelbourneFull(iso: string | Date): string {
  return formatInTimeZone(new Date(iso), TZ, "EEE d MMM, HH:mm");
}

// 当前墨尔本日历日期（不受浏览器时区影响）
export function melbourneToday(): MDY {
  const z = toZonedTime(new Date(), TZ);
  return { y: z.getFullYear(), m: z.getMonth(), d: z.getDate() };
}

// 由 UTC 时刻取出墨尔本日历日期
export function toMelbourneDay(iso: string | Date): MDY {
  const z = toZonedTime(new Date(iso), TZ);
  return { y: z.getFullYear(), m: z.getMonth(), d: z.getDate() };
}

// 给墨尔本日历日期加 n 天（正确处理跨月/跨年）
export function addMelbourneDays(day: MDY, n: number): MDY {
  const d = new Date(day.y, day.m, day.d + n);
  return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
}

// 某墨尔本日历日期的「当天 00:00」UTC 时刻（用于按天查询预订）
export function melbourneDayStartUtc(day: MDY): Date {
  return melbourneToUtc(day.y, day.m, day.d, 0, 0);
}

export function addMinutes(d: Date, m: number): Date {
  return new Date(d.getTime() + m * 60000);
}
