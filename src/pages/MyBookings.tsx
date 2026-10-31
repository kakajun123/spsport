import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";
import { fmtMoney, getMyBookings } from "../lib/api";
import { fmtMelbourneFull } from "../lib/time";

type Row = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  price: number;
  unit: { label_en: string; label_zh: string; resource?: { name_en: string; name_zh: string } };
  order: { status: string; channel: string; total: number };
};

export default function MyBookings() {
  const { user } = useAuth();
  const { t, locale } = useLocale();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!user) return;
    getMyBookings(user.id).then((d) => setRows(d as unknown as Row[]));
  }, [user]);

  const now = Date.now();
  const upcoming = rows.filter((r) => new Date(r.start_time).getTime() >= now);
  const past = rows.filter((r) => new Date(r.start_time).getTime() < now);

  function fmt(d: string) {
    return fmtMelbourneFull(d);
  }

  function Card({ r }: { r: Row }) {
    const name = locale === "zh" ? r.unit?.label_zh : r.unit?.label_en;
    return (
      <div className="flex items-center justify-between rounded border bg-white p-4">
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-sm text-muted">
            {fmt(r.start_time)} → {fmt(r.end_time)}
          </p>
        </div>
        <div className="text-right">
          <span className={`rounded px-2 py-1 text-xs ${r.status === "booked" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
            {t(`status.${r.status}`)}
          </span>
          <p className="mt-1 text-sm font-semibold">{fmtMoney(r.price)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("my.title")}</h1>
      <section>
        <h2 className="mb-2 font-semibold">{t("my.upcoming")}</h2>
        <div className="space-y-2">
          {upcoming.map((r) => <Card key={r.id} r={r} />)}
          {upcoming.length === 0 && <p className="text-sm text-muted">{t("my.empty")}</p>}
        </div>
      </section>
      <section>
        <h2 className="mb-2 font-semibold">{t("my.past")}</h2>
        <div className="space-y-2">
          {past.map((r) => <Card key={r.id} r={r} />)}
          {past.length === 0 && <p className="text-sm text-muted">{t("my.empty")}</p>}
        </div>
      </section>
    </div>
  );
}
