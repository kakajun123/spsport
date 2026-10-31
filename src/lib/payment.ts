
export type PaymentProvider = "shopify" | "stripe";

// 在 .env 里设 VITE_PAYMENT_PROVIDER=stripe 或 shopify（默认 shopify）
export function getPaymentProvider(): PaymentProvider {
  const p = import.meta.env.VITE_PAYMENT_PROVIDER as PaymentProvider | undefined;
  return p === "stripe" ? "stripe" : "shopify";
}

export interface CheckoutPayload {
  kind: "topup" | "booking";
  /** Shopify 充值：商品 Variant 的 gid */
  variantId?: string;
  /** Stripe 充值：金额（AUD） */
  amount?: number;
  /** 按次订场：多行 */
  lines?: { unitId: string; start: string; end: string }[];
  email?: string;
  name?: string;
}

export interface CheckoutResult {
  checkoutUrl: string | null;
  order_id?: string;
  error?: string;
}

/**
 * 统一的付款入口：
 * - provider = shopify → 调 shopify-checkout
 * - provider = stripe  → 调 stripe-checkout
 * 两个函数返回同样的 { checkoutUrl }，前端不用关心是哪家。
 */
export async function createPayment(_payload: CheckoutPayload): Promise<CheckoutResult> {
  throw new Error("Online payments are disabled in this open-source preview. / 此开源预览版未开放线上付款。");
}
