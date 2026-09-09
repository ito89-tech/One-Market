/**
 * TEMP / CLIENT_CONFIRMATION_REQUIRED
 *
 * Values that exist only so the local MVP can be exercised end-to-end.
 * They are not client-approved production spec. Swap via environment
 * variables; do not hardcode a live price or a live Stripe product here.
 */
export const LOCAL_TEMP = {
  /** Displayed on the mock checkout page. Not a quoted selling price. */
  mockPaymentNotice:
    "これは開発環境用のテスト決済です。Stripe には請求しません。",
  mockSuccessLabel: "テスト決済を成功させる",
  mockCancelLabel: "テスト決済をやめる",
} as const;
