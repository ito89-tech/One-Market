"""Export the LP scene and feature photos currently used on the landing page."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps

SRC = Path(r"D:\project_resume\One-Market\public\iamge")
DST = Path(r"D:\project_resume\One-Market\web\public\images")
DST.mkdir(parents=True, exist_ok=True)


def cover(im: Image.Image, size: tuple[int, int], centering: tuple[float, float] = (0.5, 0.45)) -> Image.Image:
    return ImageOps.fit(im.convert("RGB"), size, Image.Resampling.LANCZOS, centering=centering)


def grade(im: Image.Image) -> Image.Image:
    rgb = im.convert("RGB")
    rgb = ImageEnhance.Contrast(rgb).enhance(1.08)
    rgb = ImageEnhance.Color(rgb).enhance(1.04)
    rgb = ImageEnhance.Sharpness(rgb).enhance(1.12)
    rgb = ImageEnhance.Brightness(rgb).enhance(1.03)
    overlay = Image.new("RGB", rgb.size, (0, 163, 174))
    return Image.blend(rgb, overlay, 0.045)


def save(
    im: Image.Image,
    name: str,
    size: tuple[int, int],
    centering: tuple[float, float] = (0.5, 0.45),
) -> None:
    out = grade(cover(im, size, centering))
    path = DST / name
    out.save(path, "JPEG", quality=88, optimize=True)
    print("wrote", path, out.size)


def main() -> None:
    save(Image.open(SRC / "Screenshot_15.png"), "scene-review.jpg", (1600, 900))
    save(Image.open(SRC / "Screenshot_16.png"), "scene-compare.jpg", (1600, 900))
    save(Image.open(SRC / "Screenshot_20.png"), "feat-calc.jpg", (1200, 800))
    save(Image.open(SRC / "Screenshot_17.png"), "feat-docs.jpg", (1200, 800))
    save(Image.open(SRC / "Screenshot_22.png"), "feat-private.jpg", (1200, 800))
    save(Image.open(SRC / "Screenshot_5.png"), "feat-building.jpg", (1200, 800), centering=(0.5, 0.42))


if __name__ == "__main__":
    main()
