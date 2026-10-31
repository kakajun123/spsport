/** Public release gate: do not enable payment integrations until the blockers
 * in docs/REVIEW.zh-CN.md are fixed and independently verified.
 * There is deliberately no environment-variable bypass.
 */
export function paymentReleaseBlock(): Response {
  return new Response(JSON.stringify({
    error: "Online payments are disabled in this open-source preview.",
    code: "PAYMENTS_NOT_RELEASED",
  }), {
    status: 503,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
export function paymentsReady(): boolean { return false; }
