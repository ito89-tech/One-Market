import { afterEach, describe, expect, it, vi } from "vitest";

const { isMailConfigured, mailFrom, sendMail, verificationEmail } = await import(
  "@/server/mail"
);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verificationEmail", () => {
  it("登録用の件名とリンクを含む", () => {
    const body = verificationEmail({
      url: "https://example.test/verify?token=abc",
      purpose: "SIGNUP",
      deviceLabel: "Chrome / Windows",
    });
    expect(body.subject).toContain("メールアドレスの確認");
    expect(body.text).toContain("https://example.test/verify?token=abc");
    expect(body.html).toContain("href=\"https://example.test/verify?token=abc\"");
    expect(body.html).toContain("Chrome / Windows");
  });

  it("HTML に端末名の特殊文字をエスケープする", () => {
    const body = verificationEmail({
      url: "https://example.test/verify?token=abc",
      purpose: "NEW_DEVICE",
      deviceLabel: `<img src=x onerror=alert(1)>`,
    });
    expect(body.html).not.toContain("<img src");
    expect(body.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});

describe("sendMail", () => {
  it("キー未設定なら送信せず not_configured を返す", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await sendMail({
      to: "a@example.com",
      subject: "hi",
      text: "hi",
      html: "<p>hi</p>",
    });

    expect(result).toEqual({ ok: false, reason: "not_configured" });
    expect(isMailConfigured()).toBe(false);
  });

  it("EMAIL_FROM 未設定なら Resend の共有送信元を使う", () => {
    vi.stubEnv("EMAIL_FROM", "");
    expect(mailFrom()).toContain("onboarding@resend.dev");
  });
});
