import { useEffect, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { adminAdjustBalance, fmtMoney, getMembers, setRole } from "../../lib/api";
import type { Profile } from "../../lib/types";

export default function Members() {
  const { t } = useLocale();
  const [members, setMembers] = useState<Profile[]>([]);
  const [adjust, setAdjust] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setMembers(await getMembers());
  }
  useEffect(() => { load(); }, []);

  async function doAdjust(id: string) {
    const amount = Number(adjust[id] || 0);
    if (!amount) return;
    const { error } = await adminAdjustBalance(id, amount, notes[id] || undefined);
    setMsg(error ? error.message : "OK");
    if (!error) { setAdjust((s) => ({ ...s, [id]: "" })); setNotes((s) => ({ ...s, [id]: "" })); load(); }
  }

  async function doSetRole(id: string, role: string) {
    const { error } = await setRole(id, role);
    setMsg(error ? error.message : "OK");
    if (!error) load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("admin.members")}</h1>
      {msg && <p className="text-sm text-muted">{msg}</p>}
      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted">
              <th className="p-2">{t("common.name")}</th>
              <th className="p-2">{t("common.email")}</th>
              <th className="p-2">{t("mem.role")}</th>
              <th className="p-2">{t("mem.balance")}</th>
              <th className="p-2">{t("mem.adjust")}</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b">
                <td className="p-2">{m.full_name || "—"}</td>
                <td className="p-2">{m.email}</td>
                <td className="p-2">
                  <select
                    value={m.role}
                    onChange={(e) => doSetRole(m.id, e.target.value)}
                    className="rounded border px-2 py-1"
                  >
                    <option value="member">member</option>
                    <option value="front_desk">front_desk</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="p-2 font-semibold">{fmtMoney(m.balance)}</td>
                <td className="p-2">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="+/-"
                      value={adjust[m.id] ?? ""}
                      onChange={(e) => setAdjust((s) => ({ ...s, [m.id]: e.target.value }))}
                      className="w-24 rounded border px-2 py-1"
                    />
                    <input
                      placeholder={t("mem.note")}
                      value={notes[m.id] ?? ""}
                      onChange={(e) => setNotes((s) => ({ ...s, [m.id]: e.target.value }))}
                      className="w-32 rounded border px-2 py-1"
                    />
                    <button
                      onClick={() => doAdjust(m.id)}
                      className="rounded bg-gray-800 px-3 py-1 text-white hover:bg-gray-700"
                    >
                      {t("mem.adjust")}
                    </button>
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
