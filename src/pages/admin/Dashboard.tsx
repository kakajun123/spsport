import { useEffect, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { fmtMoney, getMembers, getOrders } from "../../lib/api";

type OrderRow = {
  id: string;
  status: string;
  total: number;
  channel: string;
  created_at: string;
  customer?: { full_name?: string; email?: string } | null;
};

export default function Dashboard() {
  const { t, locale } = useLocale();
  const [members, setMembers] = useState<{ balance: number }[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  useEffect(() => {
    getMembers().then((m) => setMembers(m));
    getOrders().then((o) => setOrders(o as unknown as OrderRow[]));
  }, []);

  const today = new Date().toDateString();
  const todayOrders = orders.filter(
    (o) =>
      new Date(o.created_at).toDateString() === today &&
      o.status !== "cancelled" &&
      o.status !== "pending_payment"
  );
  const revenue = todayOrders.reduce((s, o) => s + Number(o.total), 0);
  const outstanding = members.reduce((s, m) => s + Number(m.balance || 0), 0);
  const noShows = orders.filter((o) => o.status === "no_show");

  const kpis = [
    { label: t("dash.todayRevenue"), value: fmtMoney(revenue) },
    { label: t("dash.todayBookings"), value: String(todayOrders.length) },
    { label: t("dash.totalMembers"), value: String(members.length) },
    { label: t("dash.balanceOutstanding"), value: fmtMoney(outstanding) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight">{t("admin.dashboard")}</h1>
        <p className="mt-1 text-[14px] text-muted">
          {t("dash.todayBookings")} {todayOrders.length} · {t("dash.todayRevenue")} {fmtMoney(revenue)}
        </p>
      </div>

      {/* KPI 条：一个容器用 1px 分隔线分成等宽单元（type, not tiles） */}
      <div className="grid grid-cols-2 divide-x divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-surface md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="px-5 py-4">
            <p className="text-[13px] text-muted">{k.label}</p>
            <p className="mt-1 text-[24px] font-medium tabular-nums tracking-tight">{k.value}</p>
          </div>
        ))}
      </div>

      {/* 最近预订 */}
      <section>
        <h2 className="mb-2 text-[16px] font-medium">{t("admin.bookings")}</h2>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-[12px] text-muted">
                <th className="px-4 py-3 font-normal">{t("common.date")}</th>
                <th className="px-4 py-3 font-normal">{t("bk.customer")}</th>
                <th className="px-4 py-3 font-normal">{t("bk.channel")}</th>
                <th className="px-4 py-3 text-right font-normal">{t("account.amount")}</th>
                <th className="px-4 py-3 font-normal">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 8).map((o) => (
                <tr key={o.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 tabular-nums">
                    {new Date(o.created_at).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-AU")}
                  </td>
                  <td className="px-4 py-3">{o.customer?.full_name || o.customer?.email || "—"}</td>
                  <td className="px-4 py-3 text-muted">{t(`channel.${o.channel}`)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(o.total)}</td>
                  <td className="px-4 py-3 text-muted">{t(`status.${o.status}`)}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr className="border-t border-gray-100">
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">{t("common.none")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 爽约记录 */}
      <section>
        <h2 className="mb-2 text-[16px] font-medium">{t("dash.noShowRecords")}</h2>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-[12px] text-muted">
                <th className="px-4 py-3 font-normal">{t("common.date")}</th>
                <th className="px-4 py-3 font-normal">{t("bk.customer")}</th>
                <th className="px-4 py-3 text-right font-normal">{t("account.amount")}</th>
                <th className="px-4 py-3 font-normal">{t("bk.channel")}</th>
              </tr>
            </thead>
            <tbody>
              {noShows.map((o) => (
                <tr key={o.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 tabular-nums">
                    {new Date(o.created_at).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-AU")}
                  </td>
                  <td className="px-4 py-3">{o.customer?.full_name || o.customer?.email || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(o.total)}</td>
                  <td className="px-4 py-3 text-muted">{t(`channel.${o.channel}`)}</td>
                </tr>
              ))}
              {noShows.length === 0 && (
                <tr className="border-t border-gray-100">
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">{t("common.none")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
