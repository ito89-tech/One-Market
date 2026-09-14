import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.AUTH_SECRET = "a".repeat(32);

const db = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({
  hashPassword: vi.fn(async () => "hashed"),
}));

const { createUserAsAdmin, deleteUserAsAdmin } = await import("@/server/users");

beforeEach(() => {
  for (const fn of Object.values(db.user)) fn.mockReset();
});

describe("createUserAsAdmin", () => {
  it("重複メールを拒否する", async () => {
    db.user.findUnique.mockResolvedValue({ id: "existing" });
    await expect(
      createUserAsAdmin({
        email: "Taken@Example.com",
        password: "password123",
        role: "USER",
      }),
    ).resolves.toEqual({ ok: false, reason: "email_taken" });
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("確認済みアカウントとして作成する", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({
      id: "user_1",
      email: "new@example.com",
      role: "USER",
    });

    const result = await createUserAsAdmin({
      email: "New@Example.com",
      password: "password123",
      displayName: "山田",
      role: "USER",
    });

    expect(result).toEqual({
      ok: true,
      user: { id: "user_1", email: "new@example.com", role: "USER" },
    });
    expect(db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "new@example.com",
          role: "USER",
        }),
      }),
    );
  });
});

describe("deleteUserAsAdmin", () => {
  it("自分自身は削除できない", async () => {
    await expect(
      deleteUserAsAdmin({ actorId: "admin_1", targetId: "admin_1" }),
    ).resolves.toEqual({ ok: false, reason: "self" });
  });

  it("最後の管理者は削除できない", async () => {
    db.user.findUnique.mockResolvedValue({ id: "admin_2", role: "ADMIN" });
    db.user.count.mockResolvedValue(1);
    await expect(
      deleteUserAsAdmin({ actorId: "admin_1", targetId: "admin_2" }),
    ).resolves.toEqual({ ok: false, reason: "last_admin" });
    expect(db.user.delete).not.toHaveBeenCalled();
  });

  it("一般ユーザーは削除できる", async () => {
    db.user.findUnique.mockResolvedValue({ id: "user_2", role: "USER" });
    db.user.delete.mockResolvedValue({});
    await expect(
      deleteUserAsAdmin({ actorId: "admin_1", targetId: "user_2" }),
    ).resolves.toEqual({ ok: true });
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: "user_2" } });
  });
});
