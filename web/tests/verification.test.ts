import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.AUTH_SECRET = "a".repeat(32);
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

const db = {
  trustedDevice: { findUnique: vi.fn(), upsert: vi.fn() },
  emailVerification: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
  },
  user: { update: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({
  hashToken: (token: string) => `hash:${token}`,
}));
vi.mock("@/server/mail", () => ({
  isMailConfigured: () => Boolean(process.env.RESEND_API_KEY),
  sendMail: vi.fn(async () =>
    process.env.RESEND_API_KEY
      ? { ok: true, id: "msg_1" }
      : { ok: false, reason: "not_configured" },
  ),
  verificationEmail: () => ({
    subject: "確認",
    text: "text",
    html: "<p>html</p>",
  }),
}));

const {
  consumeVerification,
  describeDevice,
  isEmailVerificationEnabled,
  issueVerification,
} = await import("@/server/verification");

beforeEach(() => {
  for (const model of Object.values(db)) {
    if (typeof model === "function") {
      model.mockReset();
      continue;
    }
    for (const fn of Object.values(model)) fn.mockReset();
  }
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) =>
    fn(db),
  );
  db.emailVerification.deleteMany.mockResolvedValue({ count: 0 });
  db.emailVerification.create.mockResolvedValue({});
  db.emailVerification.update.mockResolvedValue({});
  db.user.update.mockResolvedValue({});
  db.trustedDevice.upsert.mockResolvedValue({});
  delete process.env.RESEND_API_KEY;
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
});

describe("describeDevice", () => {
  it("Chrome / Windows を要約する", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome / Windows");
  });
});

describe("isEmailVerificationEnabled", () => {
  it("Resend キーが無いときは無効", () => {
    expect(isEmailVerificationEnabled()).toBe(false);
  });

  it("Resend キーがあるときは有効", () => {
    process.env.RESEND_API_KEY = "re_test";
    expect(isEmailVerificationEnabled()).toBe(true);
  });
});

describe("issueVerification", () => {
  it("再送クールダウン中は拒否する", async () => {
    db.emailVerification.findFirst.mockResolvedValue({ id: "ev_1" });
    const result = await issueVerification({
      user: { id: "user_1", email: "a@example.com" },
      purpose: "SIGNUP",
      deviceHash: "dev",
      userAgent: null,
      respectCooldown: true,
    });
    expect(result).toEqual({ ok: false, reason: "cooldown" });
    expect(db.emailVerification.create).not.toHaveBeenCalled();
  });

  it("ローカルではメール未設定でも確認 URL を返す", async () => {
    const result = await issueVerification({
      user: { id: "user_1", email: "a@example.com" },
      purpose: "SIGNUP",
      deviceHash: "dev",
      userAgent: null,
      next: "/diagnosis/run",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.devUrl).toContain("/verify?token=");
    expect(result.devUrl).toContain("next=%2Fdiagnosis%2Frun");
  });
});

describe("consumeVerification", () => {
  it("期限切れトークンを拒否する", async () => {
    db.emailVerification.findUnique.mockResolvedValue({
      id: "ev_1",
      consumedAt: null,
      expiresAt: new Date(Date.now() - 1_000),
      userId: "user_1",
      deviceHash: "dev",
      userAgent: null,
      verifiedAt: null,
      user: { id: "user_1", emailVerifiedAt: null },
    });

    await expect(
      consumeVerification({ token: "abc", callerDeviceHash: "dev" }),
    ).resolves.toEqual({ ok: false, reason: "expired" });
  });

  it("発行元と同じ端末なら sameDevice になる", async () => {
    db.emailVerification.findUnique.mockResolvedValue({
      id: "ev_1",
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      userId: "user_1",
      deviceHash: "dev",
      userAgent: "Chrome",
      verifiedAt: null,
      user: { id: "user_1", emailVerifiedAt: null },
    });

    await expect(
      consumeVerification({ token: "abc", callerDeviceHash: "dev" }),
    ).resolves.toEqual({
      ok: true,
      userId: "user_1",
      deviceHash: "dev",
      sameDevice: true,
    });
    expect(db.user.update).toHaveBeenCalled();
    expect(db.trustedDevice.upsert).toHaveBeenCalled();
  });
});
