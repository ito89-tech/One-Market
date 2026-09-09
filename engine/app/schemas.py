"""Request/response models for the diagnosis engine.

The engine is only reachable from the Next.js server, never from a browser, so
it returns both the user-facing figures and the internal ones. The web layer is
responsible for stripping the internal block before answering a client.
"""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field


class DiagnoseRequest(BaseModel):
    prefecture: str = Field(default="", max_length=20)
    municipality: str = Field(default="", max_length=60)
    station: str = Field(min_length=1, max_length=60)
    walkMinutes: int = Field(ge=0, le=120)
    buildingAge: int = Field(ge=0, le=120)
    priceYen: Decimal = Field(gt=0)
    monthlyRentYen: Decimal = Field(gt=0)
    managementFeeYen: Decimal = Field(ge=0)
    repairReserveYen: Decimal = Field(ge=0)


class MarketPrice(BaseModel):
    lowMan: int
    highMan: int


class PriceDifference(BaseModel):
    lowMan: int
    highMan: int


class PublicResult(BaseModel):
    """ユーザー画面に表示してよい内容だけ。利回りは含めない。"""

    judgement: str
    marketPrice: MarketPrice
    listedPriceMan: int
    difference: PriceDifference


class InternalResult(BaseModel):
    """内部・管理用。公開 API のレスポンスには載せない。"""

    sheetKey: str
    sheetName: str
    areaCode: str
    matchedBy: str
    matchedValue: str | None
    ageBracketLabel: str
    yieldPercent: str
    rateLow: str
    rateHigh: str
    monthlyNetIncomeYen: str
    annualNetIncomeYen: str


class DiagnoseResponse(BaseModel):
    result: PublicResult
    internal: InternalResult


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody


class HealthResponse(BaseModel):
    status: str
    datasetGeneratedAt: str
    sheets: int
    stations: int
    localities: int
    blockers: int
    warnings: int
