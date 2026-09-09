"""HTTP surface of the diagnosis engine. Contains no business logic."""

from __future__ import annotations

import logging
from decimal import Decimal

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .dataset import get_dataset
from .diagnosis import DiagnosisError, PropertyInput, diagnose
from .schemas import (
    DiagnoseRequest,
    DiagnoseResponse,
    HealthResponse,
    InternalResult,
    MarketPrice,
    PriceDifference,
    PublicResult,
)

logger = logging.getLogger("onemake.engine")

app = FastAPI(
    title="ワンマケ 診断エンジン",
    description="社内ネットワーク専用。ブラウザから直接呼び出さないこと。",
    version="1.0.0",
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    dataset = get_dataset()
    return HealthResponse(
        status="ok",
        datasetGeneratedAt=dataset.generated_at,
        sheets=len(dataset.sheets),
        stations=dataset.station_count,
        localities=dataset.locality_count,
        blockers=sum(1 for i in dataset.issues if i["level"] == "BLOCKER"),
        warnings=sum(1 for i in dataset.issues if i["level"] == "WARNING"),
    )


@app.get("/dataset/issues")
def dataset_issues() -> dict:
    dataset = get_dataset()
    return {"generatedAt": dataset.generated_at, "issues": dataset.issues}


@app.get("/dataset/stations")
def dataset_stations() -> dict:
    dataset = get_dataset()
    return {
        "sheets": [
            {
                "key": sheet.key,
                "name": sheet.name,
                "prefectures": sheet.prefectures,
                "stations": sheet.station_names,
                "localities": sheet.locality_names,
            }
            for sheet in dataset.sheets
        ]
    }


@app.post("/diagnose", response_model=DiagnoseResponse)
def post_diagnose(payload: DiagnoseRequest):
    try:
        result = diagnose(
            get_dataset(),
            PropertyInput(
                prefecture=payload.prefecture,
                municipality=payload.municipality,
                station=payload.station,
                walk_minutes=payload.walkMinutes,
                building_age=payload.buildingAge,
                price_yen=Decimal(payload.priceYen),
                monthly_rent_yen=Decimal(payload.monthlyRentYen),
                management_fee_yen=Decimal(payload.managementFeeYen),
                repair_reserve_yen=Decimal(payload.repairReserveYen),
            ),
        )
    except DiagnosisError as exc:
        logger.info("diagnosis rejected: %s", exc.code)
        return JSONResponse(
            status_code=422,
            content={"error": {"code": exc.code, "message": exc.message}},
        )

    return DiagnoseResponse(
        result=PublicResult(
            judgement=result.judgement,
            marketPrice=MarketPrice(
                lowMan=result.market_price_low_man,
                highMan=result.market_price_high_man,
            ),
            listedPriceMan=result.listed_price_man,
            difference=PriceDifference(
                lowMan=result.difference_low_man,
                highMan=result.difference_high_man,
            ),
        ),
        internal=InternalResult(
            sheetKey=result.sheet_key,
            sheetName=result.sheet_name,
            areaCode=result.area_code,
            matchedBy=result.matched_by,
            matchedValue=result.matched_value,
            ageBracketLabel=result.age_bracket_label,
            yieldPercent=f"{result.yield_percent:.4f}",
            rateLow=f"{result.rate_low:.2f}",
            rateHigh=f"{result.rate_high:.2f}",
            monthlyNetIncomeYen=f"{result.monthly_net_income_yen:.0f}",
            annualNetIncomeYen=f"{result.annual_net_income_yen:.0f}",
        ),
    )
