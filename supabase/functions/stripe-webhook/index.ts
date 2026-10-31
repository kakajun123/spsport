import { paymentReleaseBlock, paymentsReady } from "../_shared/payment-gate.ts";
// ============================================================
// Stripe Webhook Edge Function（订阅 checkout.session.completed）
//   kind = topup   → 给会员账本入账（含档位赠送）
//   kind = booking → 把 pending 订单标记为已付款
// 需要 secrets：STRIPE_WEBHOOK_SECRET
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function verifyStripeSignature(req: Request, secret: string, raw: string): Promise<boolean> {
  const header = req.headers.get("stripe-signature");
  if (!header) return false;

  const parts: Record<string, string[]> = {};
  for (const kv of header.split(",")) {
    const [k, v] = kv.split("=");
    if (!k || v === undefined) continue;
    (parts[k] ??= []).push(v);
  }
  const t = parts.t?.[0];
  const v1 = parts.v1?.[0];
  if (!t || !v1) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${raw}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === v1;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!paymentsReady()) return paymentReleaseBlock();

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

  try {
    const raw = await req.text();
    if (!(await verifyStripeSignature(req, secret, raw))) {
      return json({ error: "invalid signature" }, 401);
    }
    const event = JSON.parse(raw);
    if (event.type !== "checkout.session.completed") {
      return json({ ok: true, skipped: event.type });
    }

    const session = event.data.object;
    const md: Record<string, string> = session.metadata || {};

    // ---------- 充值入账 ----------
    if (md.kind === "topup") {
      if (!md.member_id) throw new Error("missing member_id");

      const { data: existing } = await admin
        .from("transactions")
        .select("id")
        .eq("shopify_order_id", session.id)
        .limit(1);
      if (existing?.length) return json({ ok: true, skipped: "duplicate" });

      const paid = (session.amount_total || 0) / 100;
      let bonus = 0;
      const { data: tiers } = await admin.from("settings").select("value").eq("key", "topup_tiers").single();
      if (tiers?.value) {
        const list = Array.isArray(tiers.value) ? tiers.value : [];
        const hit = list.find((t: { amount: number }) => Number(t.amount) === paid);
        bonus = hit ? Number(hit.bonus || 0) : 0;
      }

      const { error } = await admin.rpc("credit_balance", {
        p_member_id: md.member_id,
        p_amount: paid + bonus,
        p_note: `Stripe topup ${session.id}`,
        p_shopify_order_id: session.id,
      });
      if (error) throw error;
      return json({ ok: true, credited: paid + bonus });
    }

    // ---------- 订场付款成功 ----------
    if (md.kind === "booking") {
      const { error } = await admin
        .from("orders")
        .update({ status: "confirmed", paid_at: new Date().toISOString(), shopify_order_id: session.id })
        .eq("id", md.order_id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ ok: true, skipped: "unknown kind" });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
