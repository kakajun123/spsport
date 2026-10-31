import { paymentReleaseBlock, paymentsReady } from "../_shared/payment-gate.ts";
// ============================================================
// Shopify Webhook Edge Function（订阅 orders/paid）
// 收到「订单已付款」后：
//   kind = topup   → 给会员账本入账（充值金额 + 档位赠送）
//   kind = booking → 把 pending 订单标记为 confirmed / 已付款
// 部署：supabase functions deploy shopify-webhook
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function verifyHmac(req: Request, secret: string): Promise<boolean> {
  const hmac = req.headers.get("x-shopify-hmac-sha256");
  if (!hmac) return false;
  const raw = await req.clone().text();
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const digest = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return digest === hmac;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!paymentsReady()) return paymentReleaseBlock();

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceRole);
  const secret = Deno.env.get("SHOPIFY_WEBHOOK_SECRET")!;

  try {
    if (!(await verifyHmac(req, secret))) {
      return json({ error: "invalid signature" }, 401);
    }

    const payload = await req.json();
    const order = payload as {
      id: number;
      total_price: string;
      note: string | null;
      financial_status: string;
    };
    if (order.financial_status !== "paid") return json({ ok: true, skipped: "not paid" });

    let note: Record<string, unknown> = {};
    try { note = order.note ? JSON.parse(order.note) : {}; } catch { /* ignore */ }
    const kind = note.kind;

    // ---------- 充值入账 ----------
    if (kind === "topup") {
      const memberId = note.member_id as string;
      if (!memberId) throw new Error("missing member_id");

      // 幂等：同一 Shopify 订单只入账一次
      const { data: existing } = await admin
        .from("transactions")
        .select("id")
        .eq("shopify_order_id", String(order.id))
        .limit(1);
      if (existing?.length) return json({ ok: true, skipped: "duplicate" });

      const paid = Number(order.total_price);
      // 读取充值档位，匹配赠送
      let bonus = 0;
      const { data: tiers } = await admin.from("settings").select("value").eq("key", "topup_tiers").single();
      if (tiers?.value) {
        const list = Array.isArray(tiers.value) ? tiers.value : [];
        const hit = list.find((t: { amount: number }) => Number(t.amount) === paid);
        bonus = hit ? Number(hit.bonus || 0) : 0;
      }

      const { error } = await admin.rpc("credit_balance", {
        p_member_id: memberId,
        p_amount: paid + bonus,
        p_note: `Shopify topup #${order.id} (paid ${paid}, bonus ${bonus})`,
        p_shopify_order_id: String(order.id),
      });
      if (error) throw error;
      return json({ ok: true, credited: paid + bonus });
    }

    // ---------- 按次订场付款成功 ----------
    if (kind === "booking") {
      const orderId = note.order_id as string;
      if (!orderId) throw new Error("missing order_id");
      const { error } = await admin
        .from("orders")
        .update({ status: "confirmed", paid_at: new Date().toISOString(), shopify_order_id: String(order.id) })
        .eq("id", orderId);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ ok: true, skipped: "unknown kind" });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
