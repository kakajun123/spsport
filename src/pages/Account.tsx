import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";
import { createCheckout, fmtMoney, getMyTransactions, getSetting } from "../lib/api";
import type { TopupTier, Transaction } from "../lib/types";

export default function Account() {
  const { user, profile, refreshProfile } = useAuth();
  const { t } = useLocale();
  const [tiers, setTiers] = useState<TopupTier[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    const [tierList, txList] = await Promise.all([
      getSetting<TopupTier[]>("topup_tiers", []),
      getMyTransactions(user.id),
    ]);
    setTiers(tierList);
    setTxs(txList);
  }

  useEffect(() => {
    load();
  }, [user]);

  async function topup(tier: TopupTier) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await createCheckout({
        kind: "topup",
        variantId: tier.variantId || undefined,
        amount: tier.amount,
      });
      if (res.error) throw new Error(res.error);
      if (res.checkoutUrl) {
        setMsg(t("book.redirecting"));
        window.location.href = res.checkoutUrl;
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("account.title")}</h1>
        <button
          onClick={async () => { await refreshProfile(); await load(); }}
          className="rounded border px-3 py-1 text-sm hover:bg-gray-100"
        >
          ↻
        </button>
      </div>

      <div className="rounded border bg-white p-5">
        <p className="text-sm text-muted">{t("account.balance")}</p>
        <p className="text-3xl font-bold text-brand">{fmtMoney(profile?.balance ?? 0)}</p>
      </div>

      <div className="rounded border bg-white p-5">
        <h2 className="mb-3 font-semibold">{t("account.topupTitle")}</h2>
        {msg && <p className="mb-2 text-sm text-muted">{msg}</p>}
        <div className="flex flex-wrap gap-3">
          {tiers.map((tier) => (
            <button
              key={tier.amount}
              disabled={busy}
              onClick={() => topup(tier)}
              className="rounded border bg-gray-50 px-4 py-3 text-left hover:border-brand disabled:opacity-50"
            >
              <p className="font-bold">{fmtMoney(tier.amount)}</p>
              {tier.bonus > 0 && (
                <p className="text-xs text-green-600">+{fmtMoney(tier.bonus)}</p>
              )}
            </button>
          ))}
          {tiers.length === 0 && <p className="text-sm text-muted">{t("common.none")}</p>}
        </div>
      </div>

      <div className="rounded border bg-white p-5">
        <h2 className="mb-3 font-semibold">{t("account.transactions")}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted">
              <th className="py-2">{t("account.type")}</th>
              <th>{t("account.amount")}</th>
              <th>{t("account.balanceAfter")}</th>
              <th>{t("account.date")}</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((tx) => (
              <tr key={tx.id} className="border-b">
                <td className="py-2">{t(`tx.${tx.type}`)}</td>
                <td className={tx.amount >= 0 ? "text-green-600" : "text-red-600"}>
                  {tx.amount >= 0 ? "+" : ""}
                  {fmtMoney(tx.amount)}
                </td>
                <td>{fmtMoney(tx.balance_after)}</td>
                <td className="text-muted">
                  {new Date(tx.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {txs.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-muted">{t("common.none")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
