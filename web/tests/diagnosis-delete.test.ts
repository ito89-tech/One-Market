import { beforeEach, describe, expect, it, vi } from "vitest";

const db = {
  propertyDiagnosis: { deleteMany: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));

const {
  deleteAllUserDiagnoses,
  deleteDiagnosisAsAdmin,
  deleteUserDiagnosis,
} = await import("@/server/diagnosis");

beforeEach(() => {
  db.propertyDiagnosis.deleteMany.mockReset();
});

describe("診断履歴の削除", () => {
  it("自分の id だけを消す", async () => {
    db.propertyDiagnosis.deleteMany.mockResolvedValue({ count: 1 });
    await expect(deleteUserDiagnosis("user_1", "diag_1")).resolves.toBe(true);
    expect(db.propertyDiagnosis.deleteMany).toHaveBeenCalledWith({
      where: { id: "diag_1", userId: "user_1" },
    });
  });

  it("他人の id は見つからない扱い", async () => {
    db.propertyDiagnosis.deleteMany.mockResolvedValue({ count: 0 });
    await expect(deleteUserDiagnosis("user_1", "diag_other")).resolves.toBe(false);
  });

  it("一括削除は自分の履歴だけ", async () => {
    db.propertyDiagnosis.deleteMany.mockResolvedValue({ count: 3 });
    await expect(deleteAllUserDiagnoses("user_1")).resolves.toBe(3);
    expect(db.propertyDiagnosis.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user_1" },
    });
  });

  it("管理者は所有者に関係なく消せる", async () => {
    db.propertyDiagnosis.deleteMany.mockResolvedValue({ count: 1 });
    await expect(deleteDiagnosisAsAdmin("diag_1")).resolves.toBe(true);
    expect(db.propertyDiagnosis.deleteMany).toHaveBeenCalledWith({
      where: { id: "diag_1" },
    });
  });
});
