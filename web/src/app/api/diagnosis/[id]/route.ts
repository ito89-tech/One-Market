import { fail, internalError, ok } from "@/lib/api";
import { AuthError, assertSameOrigin, requireUser } from "@/lib/auth";
import { deleteUserDiagnosis, findUserDiagnosis } from "@/server/diagnosis";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const diagnosis = await findUserDiagnosis(user.id, id);
    if (!diagnosis) {
      // Same response whether the row is missing or owned by someone else, so
      // ids cannot be probed for existence.
      return fail("NOT_FOUND", "診断結果が見つかりませんでした。");
    }

    return ok({
      id: diagnosis.id,
      createdAt: diagnosis.createdAt,
      plan: diagnosis.plan,
      property: {
        prefecture: diagnosis.prefecture,
        municipality: diagnosis.municipality,
        station: diagnosis.stationInput,
        walkMinutes: diagnosis.walkMinutes,
        buildingAge: diagnosis.buildingAge,
        priceMan: Number(diagnosis.priceYen) / 10_000,
        monthlyRentYen: Number(diagnosis.monthlyRentYen),
        managementFeeYen: Number(diagnosis.managementFeeYen),
        repairReserveYen: Number(diagnosis.repairReserveYen),
      },
      // 内部利回り・エリアコードはここに含めない（管理画面のみ）
      result: {
        judgement: diagnosis.judgement,
        marketPrice: {
          lowMan: diagnosis.marketPriceLowMan,
          highMan: diagnosis.marketPriceHighMan,
        },
        difference: {
          lowMan: diagnosis.differenceLowMan,
          highMan: diagnosis.differenceHighMan,
        },
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    return internalError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await assertSameOrigin();
    const user = await requireUser();
    const { id } = await params;

    const deleted = await deleteUserDiagnosis(user.id, id);
    if (!deleted) {
      return fail("NOT_FOUND", "診断結果が見つかりませんでした。");
    }

    return ok({ id });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    return internalError(error);
  }
}
