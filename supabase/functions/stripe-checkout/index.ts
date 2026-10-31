import { paymentReleaseBlock, paymentsReady } from "../_shared/payment-gate.ts";
// ============================================================
// Stripe Checkout Edge Function（与 shopify-checkout 并存）
//   kind = "topup"   充值：按金额直接建 Checkout Session
//   kind = "booking" 按次订场：先落 pending 订单 + 占时段，再建 Session
// 需要 secrets：STRIPE_SECRET_KEY、SITE_URL
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

interface BookingLine {
  unitId: string;
  start: string;
  end: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!paymentsReady()) return paymentReleaseBlock();

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
  const siteUrl = Deno.env.get("SITE_URL") || "http://localhost:5173";

  async function createSession(opts: {
    amountCents: number;
    name: string;
    metadata: Record<string, string>;
    success: string;
    cancel: string;
  }) {
    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("success_url", opts.success);
    params.set("cancel_url", opts.cancel);
    params.set("line_items[0][price_data][currency]", "aud");
    params.set("line_items[0][price_data][unit_amount]", String(opts.amountCents));
    params.set("line_items[0][price_data][product_data][name]", opts.name);
    params.set("line_items[0][quantity]", "1");
    for (const [k, v] of Object.entries(opts.metadata)) params.set(`metadata[${k}]`, v);

    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const s = await r.json();
    if (s.error) throw new Error(s.error.message);
    return s;
  }

  try {
    const body = await req.json();
    const kind = body.kind as string;

    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    let memberId: string | null = null;
    if (jwt) {
      const { data: { user } } = await admin.auth.getUser(jwt);
      memberId = user?.id ?? null;
    }

    // ---------- 充值 ----------
    if (kind === "topup") {
      if (!memberId) throw new Error("login required for topup");
      const amount = Math.round(Number(body.amount) * 100);
      if (!amount || amount < 100) throw new Error("invalid amount");

      const s = await createSession({
        amountCents: amount,
        name: `Top-up $${(amount / 100).toFixed(2)}`,
        metadata: { kind: "topup", member_id: memberId },
        success: `${siteUrl}/account?paid=1`,
        cancel: `${siteUrl}/account?cancelled=1`,
      });
      return json({ checkoutUrl: s.url });
    }

    // ---------- 按次订场 ----------
    if (kind === "booking") {
      const lines = body.lines as BookingLine[];
      if (!lines?.length) throw new Error("lines required");

      const unitIds = [...new Set(lines.map((l) => l.unitId))];
      const { data: units, error: uerr } = await admin
        .from("resource_units")
        .select("id, resource:resources(price_member, price_non_member)")
        .in("id", unitIds);
      if (uerr || !units?.length) throw new Error("invalid units");
      const byId = new Map(units.map((u) => [u.id, u]));

      const isMember = !!memberId;

      for (const l of lines) {
        if (!byId.get(l.unitId)) throw new Error("invalid unit");
        const start = new Date(l.start).toISOString();
        const end = new Date(l.end).toISOString();
        const ms = new Date(end).getTime() - new Date(start).getTime();
        if (ms <= 0 || ms % 1800000 !== 0) throw new Error("must be 30-minute increments");

        const { data: clash } = await admin
          .from("bookings")
          .select("id")
          .eq("unit_id", l.unitId)
          .neq("status", "cancelled")
          .lt("start_time", end)
          .gt("end_time", start)
          .limit(1);
        if (clash && clash.length) throw new Error("slot unavailable");
      }

      // 分时计价（高峰倍数在数据库里算）
      const { data: totalData, error: totalErr } = await admin.rpc("compute_booking_total", {
        p_lines: lines.map((l) => ({
          unit_id: l.unitId,
          start_time: new Date(l.start).toISOString(),
          end_time: new Date(l.end).toISOString(),
        })),
        p_member: isMember,
      });
      if (totalErr) throw totalErr;
      const total = Number(totalData);

      const { data: order, error: oerr } = await admin
        .from("orders")
        .insert({ customer_id: memberId, created_by: memberId, channel: "shopify", status: "pending_payment", total: total.toFixed(2) })
        .select("id")
        .single();
      if (oerr) throw oerr;

      const rows = lines.map((l) => {
        const u = byId.get(l.unitId)!;
        return {
          order_id: order.id,
          unit_id: l.unitId,
          start_time: new Date(l.start).toISOString(),
          end_time: new Date(l.end).toISOString(),
          status: "booked",
          price: isMember ? u.resource.price_member : u.resource.price_non_member,
        };
      });
      const { error: berr } = await admin.from("bookings").insert(rows);
      if (berr) throw berr;

      const s = await createSession({
        amountCents: Math.round(total * 100),
        name: "Venue booking",
        metadata: { kind: "booking", order_id: order.id },
        success: `${siteUrl}/my-bookings?paid=1`,
        cancel: `${siteUrl}/?cancelled=1`,
      });
      return json({ checkoutUrl: s.url, order_id: order.id });
    }

    throw new Error("unknown kind");
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
