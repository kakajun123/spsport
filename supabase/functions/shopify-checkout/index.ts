import { paymentReleaseBlock, paymentsReady } from "../_shared/payment-gate.ts";
// ============================================================
// Shopify Checkout Edge Function
//   kind = "topup"   会员充值：Storefront API 建 cart → checkoutUrl
//   kind = "booking" 散客/按次订场（支持购物车多行）：先落 pending 订单 → Draft Order → 付款链接
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

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceRole);

  const domain = Deno.env.get("SHOPIFY_STORE_DOMAIN")!;
  const storefrontToken = Deno.env.get("SHOPIFY_STOREFRONT_TOKEN")!;
  const adminToken = Deno.env.get("SHOPIFY_ADMIN_TOKEN")!;

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
      const variantId = body.variantId as string;
      if (!variantId) throw new Error("variantId required");

      const query = `
        mutation cartCreate($input: CartInput!) {
          cartCreate(input: $input) {
            cart { id checkoutUrl }
            userErrors { field message }
          }
        }`;
      const vars = {
        input: {
          note: JSON.stringify({ kind: "topup", member_id: memberId }),
          lines: [{
            merchandiseId: variantId,
            quantity: 1,
            attributes: [{ key: "kind", value: "topup" }, { key: "member_id", value: memberId }],
          }],
        },
      };
      const r = await fetch(`https://${domain}/api/2024-10/graphql.json`, {
        method: "POST",
        headers: { "X-Shopify-Storefront-Access-Token": storefrontToken, "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: vars }),
      });
      const g = await r.json();
      const err = g?.data?.cartCreate?.userErrors?.[0];
      if (err) throw new Error(err.message);
      return json({ checkoutUrl: g.data.cartCreate.cart.checkoutUrl });
    }

    // ---------- 按次订场（购物车多行） ----------
    if (kind === "booking") {
      const lines = body.lines as BookingLine[];
      if (!lines?.length) throw new Error("lines required");

      const unitIds = [...new Set(lines.map((l) => l.unitId))];
      const { data: units, error: uerr } = await admin
        .from("resource_units")
        .select("id, resource:resources(price_member, price_non_member, name_en)")
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

        // 逐行防撞单
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

      // 落 pending 订单 + 多行 booking
      const { data: order, error: oerr } = await admin
        .from("orders")
        .insert({
          customer_id: memberId,
          created_by: memberId,
          channel: "shopify",
          status: "pending_payment",
          total: total.toFixed(2),
        })
        .select("id")
        .single();
      if (oerr) throw oerr;

      const rows = lines.map((l) => {
        const u = byId.get(l.unitId)!;
        const p = isMember ? u.resource.price_member : u.resource.price_non_member;
        return {
          order_id: order.id,
          unit_id: l.unitId,
          start_time: new Date(l.start).toISOString(),
          end_time: new Date(l.end).toISOString(),
          status: "booked",
          price: p,
        };
      });
      const { error: berr } = await admin.from("bookings").insert(rows);
      if (berr) throw berr;

      // Draft Order 收总金额
      const dr = await fetch(`https://${domain}/admin/api/2024-10/draft_orders.json`, {
        method: "POST",
        headers: { "X-Shopify-Access-Token": adminToken, "Content-Type": "application/json" },
        body: JSON.stringify({
          draft_order: {
            line_items: [{ title: "Venue booking", price: total.toFixed(2), quantity: 1 }],
            note: JSON.stringify({ kind: "booking", order_id: order.id }),
            ...(body.email ? { email: body.email } : {}),
          },
        }),
      });
      const d = await dr.json();
      if (d.errors) throw new Error(JSON.stringify(d.errors));
      return json({ checkoutUrl: d.draft_order.invoice_url, order_id: order.id });
    }

    throw new Error("unknown kind");
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
