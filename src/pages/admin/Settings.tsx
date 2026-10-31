import { useEffect, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { getSetting, upsertSetting } from "../../lib/api";
import type { BusinessHours, Locale, TopupTier } from "../../lib/types";

export default function Settings() {
  const { t } = useLocale();
  const [hours, setHours] = useState<BusinessHours>({ default: { open: "09:00", close: "23:00" } });
  const [windowH, setWindowH] = useState(2);
  const [noShow, setNoShow] = useState("full");
  const [tiers, setTiers] = useState<TopupTier[]>([]);
  const [locale, setLocale] = useState<Locale>("en");
  const [peakMultiplier, setPeakMultiplier] = useState(1.3);
  const [weekdayPeak, setWeekdayPeak] = useState({ start: "18:00", end: "22:00" });
  const [weekendPeak, setWeekendPeak] = useState({ start: "09:00", end: "22:00" });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setHours(await getSetting<BusinessHours>("business_hours", { default: { open: "09:00", close: "23:00" } }));
      setWindowH(await getSetting<number>("cancellation_window_hours", 2));
      setNoShow((await getSetting<{ mode: string }>("no_show_penalty", { mode: "full" })).mode);
      setTiers(await getSetting<TopupTier[]>("topup_tiers", []));
      setLocale(await getSetting<Locale>("default_locale", "en"));
      const pp = await getSetting("peak_pricing", {
        peak_multiplier: 1.3,
        weekday_peak: { start: "18:00", end: "22:00" },
        weekend_peak: { start: "09:00", end: "22:00" },
      });
      setPeakMultiplier(pp.peak_multiplier);
      setWeekdayPeak(pp.weekday_peak);
      setWeekendPeak(pp.weekend_peak);
    })();
  }, []);

  async function save() {
    await upsertSetting("business_hours", hours);
    await upsertSetting("cancellation_window_hours", windowH);
    await upsertSetting("no_show_penalty", { mode: noShow });
    await upsertSetting("topup_tiers", tiers);
    await upsertSetting("default_locale", locale);
    await upsertSetting("peak_pricing", {
      peak_multiplier: peakMultiplier,
      weekday_peak: weekdayPeak,
      weekend_peak: weekendPeak,
    });
    setMsg("OK");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("admin.settings")}</h1>

      <div className="rounded border bg-white p-4">
        <h2 className="mb-3 font-semibold">{t("set.businessHours")}</h2>
        <div className="flex gap-4">
          <label className="text-sm">
            <span className="text-muted">{t("set.open")}</span>
            <input
              type="time"
              className="mt-1 block rounded border px-2 py-1"
              value={hours.default.open}
              onChange={(e) => setHours({ ...hours, default: { ...hours.default, open: e.target.value } })}
            />
          </label>
          <label className="text-sm">
            <span className="text-muted">{t("set.close")}</span>
            <input
              type="time"
              className="mt-1 block rounded border px-2 py-1"
              value={hours.default.close}
              onChange={(e) => setHours({ ...hours, default: { ...hours.default, close: e.target.value } })}
            />
          </label>
        </div>
      </div>

      <div className="rounded border bg-white p-4">
        <h2 className="mb-3 font-semibold">{t("set.cancellationWindow")}</h2>
        <input
          type="number"
          className="rounded border px-2 py-1"
          value={windowH}
          onChange={(e) => setWindowH(Number(e.target.value))}
        />
        <span className="ml-2 text-sm text-muted">h</span>
      </div>

      <div className="rounded border bg-white p-4">
        <h2 className="mb-3 font-semibold">{t("set.noShowPenalty")}</h2>
        <select
          className="rounded border px-2 py-1"
          value={noShow}
          onChange={(e) => setNoShow(e.target.value)}
        >
          <option value="full">{t("set.full")}</option>
        </select>
      </div>

      <div className="rounded border bg-white p-4">
        <h2 className="mb-3 font-semibold">{t("set.topupTiers")}</h2>
        <div className="space-y-2">
          {tiers.map((tier, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="number"
                placeholder={t("set.amount")}
                className="rounded border px-2 py-1"
                value={tier.amount}
                onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))}
              />
              <input
                type="number"
                placeholder={t("set.bonus")}
                className="rounded border px-2 py-1"
                value={tier.bonus}
                onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, bonus: Number(e.target.value) } : x)))}
              />
              <input
                placeholder={t("set.variantId")}
                className="w-56 rounded border px-2 py-1"
                value={tier.variantId}
                onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, variantId: e.target.value } : x)))}
              />
              <button
                onClick={() => setTiers(tiers.filter((_, j) => j !== i))}
                className="rounded-control px-2 py-1 text-[13px] text-negative hover:bg-red-50"
              >
                {t("cart.remove")}
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => setTiers([...tiers, { amount: 0, bonus: 0, variantId: "" }])}
          className="mt-2 rounded border px-3 py-1 text-sm hover:bg-gray-50"
        >
          {t("set.addTier")}
        </button>
      </div>

      <div className="rounded border bg-white p-4">
        <h2 className="mb-3 font-semibold">{t("set.defaultLocale")}</h2>
        <select
          className="rounded border px-2 py-1"
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
        >
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
      </div>

      {/* 分时定价：高峰倍数 + 工作日/周末高峰时段 */}
      <div className="rounded-lg border border-gray-200 bg-surface p-4">
        <h2 className="mb-3 font-semibold">{t("set.peakPricing")}</h2>
        <div className="flex flex-wrap gap-6">
          <label className="text-sm">
            <span className="text-muted">{t("set.peakMultiplier")}</span>
            <input
              type="number"
              step="0.05"
              className="mt-1 block w-24 rounded-control border px-2 py-1"
              value={peakMultiplier}
              onChange={(e) => setPeakMultiplier(Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            <span className="text-muted">{t("set.weekdayPeak")}</span>
            <div className="mt-1 flex gap-2">
              <input type="time" className="rounded-control border px-2 py-1" value={weekdayPeak.start} onChange={(e) => setWeekdayPeak({ ...weekdayPeak, start: e.target.value })} />
              <input type="time" className="rounded-control border px-2 py-1" value={weekdayPeak.end} onChange={(e) => setWeekdayPeak({ ...weekdayPeak, end: e.target.value })} />
            </div>
          </label>
          <label className="text-sm">
            <span className="text-muted">{t("set.weekendPeak")}</span>
            <div className="mt-1 flex gap-2">
              <input type="time" className="rounded-control border px-2 py-1" value={weekendPeak.start} onChange={(e) => setWeekendPeak({ ...weekendPeak, start: e.target.value })} />
              <input type="time" className="rounded-control border px-2 py-1" value={weekendPeak.end} onChange={(e) => setWeekendPeak({ ...weekendPeak, end: e.target.value })} />
            </div>
          </label>
        </div>
      </div>

      {msg && <p className="text-sm text-green-600">{msg}</p>}
      <button onClick={save} className="rounded bg-brand px-4 py-2 text-white hover:bg-brand-ink">
        {t("common.save")}
      </button>
    </div>
  );
}
