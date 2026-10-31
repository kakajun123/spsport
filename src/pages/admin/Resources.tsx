import { useEffect, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { fmtMoney, getResources, updateResource, getAllUnits, setUnitActive } from "../../lib/api";
import type { Resource, ResourceUnit } from "../../lib/types";

export default function Resources() {
  const { t, locale } = useLocale();
  const [resources, setResources] = useState<Resource[]>([]);
  const [units, setUnits] = useState<ResourceUnit[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setResources(await getResources());
    setUnits(await getAllUnits());
  }
  useEffect(() => { load(); }, []);

  function patch(id: string, field: keyof Resource, value: unknown) {
    setResources((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  async function save(r: Resource) {
    const { error } = await updateResource(r.id, {
      name_en: r.name_en,
      name_zh: r.name_zh,
      price_member: Number(r.price_member),
      price_non_member: Number(r.price_non_member),
      active: r.active,
    });
    setMsg(error ? error.message : "OK");
  }

  async function toggleUnit(u: ResourceUnit) {
    const { error } = await setUnitActive(u.id, !u.active);
    setMsg(error ? error.message : "OK");
    if (!error) setUnits((list) => list.map((x) => (x.id === u.id ? { ...x, active: !x.active } : x)));
  }

  const grouped = resources.map((r) => ({
    resource: r,
    units: units.filter((u) => u.resource_id === r.id),
  }));

  return (
    <div className="space-y-8">
      <h1 className="text-[24px] font-semibold tracking-tight">{t("admin.resources")}</h1>
      {msg && <p className="text-[13px] text-muted">{msg}</p>}

      <section>
        <div className="space-y-3">
          {resources.map((r) => (
            <div key={r.id} className="rounded-lg border border-gray-200 bg-surface p-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <label className="text-sm">
                  <span className="text-muted">{t("res.nameEn")}</span>
                  <input className="mt-1 w-full rounded-control border px-2 py-1" value={r.name_en} onChange={(e) => patch(r.id, "name_en", e.target.value)} />
                </label>
                <label className="text-sm">
                  <span className="text-muted">{t("res.nameZh")}</span>
                  <input className="mt-1 w-full rounded-control border px-2 py-1" value={r.name_zh} onChange={(e) => patch(r.id, "name_zh", e.target.value)} />
                </label>
                <label className="text-sm">
                  <span className="text-muted">{t("res.priceMember")}</span>
                  <input type="number" step="0.01" className="mt-1 w-full rounded-control border px-2 py-1" value={r.price_member} onChange={(e) => patch(r.id, "price_member", e.target.value)} />
                </label>
                <label className="text-sm">
                  <span className="text-muted">{t("res.priceNonMember")}</span>
                  <input type="number" step="0.01" className="mt-1 w-full rounded-control border px-2 py-1" value={r.price_non_member} onChange={(e) => patch(r.id, "price_non_member", e.target.value)} />
                </label>
                <label className="flex items-end gap-2 text-sm">
                  <input type="checkbox" checked={r.active} onChange={(e) => patch(r.id, "active", e.target.checked)} />
                  {t("res.active")}
                  <span className="ml-auto text-xs text-muted">{fmtMoney(Number(r.price_member))}</span>
                </label>
              </div>
              <div className="mt-2 text-right">
                <button onClick={() => save(r)} className="rounded-control bg-brand px-3 py-1 text-sm text-white hover:bg-brand-ink">
                  {t("common.save")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 场地管理：逐个开关 */}
      <section>
        <h2 className="mb-3 text-[16px] font-medium">{t("admin.units")}</h2>
        {grouped.map(({ resource, units: us }) =>
          us.length === 0 ? null : (
            <div key={resource.id} className="mb-4">
              <p className="mb-2 text-[13px] text-muted">{locale === "zh" ? resource.name_zh : resource.name_en}</p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                {us.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => toggleUnit(u)}
                    className={`rounded-control border px-2 py-1.5 text-[12px] ${
                      u.active
                        ? "border-brand bg-brand-soft text-brand-ink"
                        : "border-gray-200 bg-gray-100 text-muted line-through"
                    }`}
                  >
                    {locale === "zh" ? u.label_zh : u.label_en}
                  </button>
                ))}
              </div>
            </div>
          )
        )}
      </section>
    </div>
  );
}
