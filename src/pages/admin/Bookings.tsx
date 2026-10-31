import { useEffect, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import {
  cancelOrder,
  completeOrder,
  createBookingStaff,
  fmtMoney,
  getMembers,
  getOrders,
  getSetting,
  getUnits,
  markNoShow,
} from "../../lib/api";
import { addMinutes, fmtMelbourne, melbourneToUtc } from "../../lib/time";
import type { BusinessHours, Profile, ResourceUnit } from "../../lib/types";

type OrderRow = {
  id: string;
  status: string;
  channel: string;
  total: number;
  created_at: string;
  customer?: { full_name?: string; email?: string } | null;
};

function pad(n: number) { return String(n).padStart(2, "0"); }

export default function Bookings() {
  const { t, locale } = useLocale();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [units, setUnits] = useState<ResourceUnit[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [hours, setHours] = useState<BusinessHours>({ default: { open: "09:00", close: "23:00" } });
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // form state
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [unitId, setUnitId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState(1);
  const [channel, setChannel] = useState("cash");
  const [customerId, setCustomerId] = useState("");

  async function loadOrders() {
    setOrders((await getOrders()) as unknown as OrderRow[]);
  }

  useEffect(() => {
    loadOrders();
    getUnits().then(setUnits);
    getMembers().then((m) => setMembers(m.filter((x) => x.role === "member")));
    getSetting<BusinessHours>("business_hours", { default: { open: "09:00", close: "23:00" } }).then(setHours);
  }, []);

  const [oh, om] = hours.default.open.split(":").map(Number);
  const [ch, cm] = hours.default.close.split(":").map(Number);
  const slotOptions: { label: string; iso: string }[] = [];
  {
    const [y, mo, dd] = date.split("-").map(Number);
    let cur = melbourneToUtc(y, mo - 1, dd, oh, om);
    const close = melbourneToUtc(y, mo - 1, dd, ch, cm);
    while (cur < close) {
      slotOptions.push({ label: fmtMelbourne(cur), iso: cur.toISOString() });
      cur = addMinutes(cur, 30);
    }
  }

  async function submitNew() {
    if (!unitId || !startTime) return;
    const start = new Date(startTime);
    const end = new Date(start.getTime() + duration * 30 * 60000);
    const { error } = await createBookingStaff({
      customerId: customerId || null,
      unitIds: [unitId],
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      channel,
      paid: true,
    });
    setMsg(error ? error.message : "OK");
    if (!error) {
      setShowForm(false);
      setUnitId(""); setStartTime(""); setCustomerId("");
      loadOrders();
    }
  }

  async function action(fn: (id: string) => Promise<unknown>, id: string) {
    const { error } = (await fn(id)) as { error?: { message: string } | null };
    setMsg(error ? error.message : "OK");
    loadOrders();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin.bookings")}</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-brand px-4 py-2 text-white hover:bg-brand-ink"
        >
          {t("bk.create")}
        </button>
      </div>

      {msg && <p className="text-sm text-muted">{msg}</p>}

      {showForm && (
        <div className="space-y-3 rounded border bg-white p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <label className="text-sm">
              <span className="text-muted">{t("book.selectDate")}</span>
              <input type="date" className="mt-1 block w-full rounded border px-2 py-1" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="text-muted">{t("bk.resource")}</span>
              <select className="mt-1 block w-full rounded border px-2 py-1" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">—</option>
                {units.filter((u) => !u.resource?.is_addon).map((u) => (
                  <option key={u.id} value={u.id}>{locale === "zh" ? u.label_zh : u.label_en}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-muted">{t("book.selectTime")}</span>
              <select className="mt-1 block w-full rounded border px-2 py-1" value={startTime} onChange={(e) => setStartTime(e.target.value)}>
                <option value="">—</option>
                {slotOptions.map((s) => <option key={s.iso} value={s.iso}>{s.label}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-muted">{t("book.duration")}</span>
              <select className="mt-1 block w-full rounded border px-2 py-1" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n * 30} min</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-muted">{t("bk.channel")}</span>
              <select className="mt-1 block w-full rounded border px-2 py-1" value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="cash">{t("channel.cash")}</option>
                <option value="card">{t("channel.card")}</option>
                <option value="member_balance">{t("channel.member_balance")}</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="text-muted">{t("bk.customer")}</span>
              <select className="mt-1 block w-full rounded border px-2 py-1" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">— {t("common.none")}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                ))}
              </select>
            </label>
          </div>
          <button onClick={submitNew} className="rounded bg-gray-800 px-4 py-2 text-white hover:bg-gray-700">
            {t("common.confirm")}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted">
              <th className="p-2">{t("common.date")}</th>
              <th className="p-2">{t("bk.customer")}</th>
              <th className="p-2">{t("bk.channel")}</th>
              <th className="p-2">{t("account.amount")}</th>
              <th className="p-2">{t("common.status")}</th>
              <th className="p-2">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b">
                <td className="p-2">{new Date(o.created_at).toLocaleString(locale === "zh" ? "zh-CN" : "en-AU")}</td>
                <td className="p-2">{o.customer?.full_name || o.customer?.email || t("common.none")}</td>
                <td className="p-2">{t(`channel.${o.channel}`)}</td>
                <td className="p-2 font-semibold">{fmtMoney(o.total)}</td>
                <td className="p-2">
                  <span className={`rounded px-2 py-1 text-xs ${o.status === "confirmed" ? "bg-green-100 text-green-700" : o.status === "no_show" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                    {t(`status.${o.status}`)}
                  </span>
                </td>
                <td className="p-2">
                  <div className="flex gap-1">
                    {o.status === "confirmed" && (
                      <>
                        <button onClick={() => action(completeOrder, o.id)} className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200">{t("bk.complete")}</button>
                        <button onClick={() => action(markNoShow, o.id)} className="rounded bg-red-100 px-2 py-1 text-red-700 hover:bg-red-200">{t("bk.markNoShow")}</button>
                      </>
                    )}
                    {(o.status === "confirmed" || o.status === "pending_payment") && (
                      <button
                        onClick={() => action((id) => cancelOrder(id, o.channel === "member_balance"), o.id)}
                        className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200"
                      >
                        {t("bk.cancelBooking")}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
