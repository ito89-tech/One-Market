"""Export first-view device shots with the studio backdrop removed."""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ASSETS = Path(
    r"C:\Users\Administrator\.cursor\projects\d-project-resume-One-Market\assets"
)
DST = Path(r"D:\project_resume\One-Market\web\public\images")
DST.mkdir(parents=True, exist_ok=True)

PHONE_SRC = (
    ASSETS
    / "c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_d8a4043ce0be3f331e0de01e107cd6d2_images_slide-2d77d20a-4970-4591-96ea-1af0a403b32b.jpg"
)
LAPTOP_SRC = (
    ASSETS
    / "c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_d8a4043ce0be3f331e0de01e107cd6d2_images_pc-b9da202e-9cb4-4595-8219-0a90e810b032.jpg"
)


def knock_edge_black(im: Image.Image, thresh: int = 10) -> Image.Image:
    rgba = im.convert("RGBA")
    w, h = rgba.size
    pix = rgba.load()
    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def dark(x: int, y: int) -> bool:
        r, g, b, _a = pix[x, y]
        return r <= thresh and g <= thresh and b <= thresh

    def push(x: int, y: int) -> None:
        i = y * w + x
        if seen[i] or not dark(x, y):
            return
        seen[i] = 1
        q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while q:
        x, y = q.popleft()
        pix[x, y] = (0, 0, 0, 0)
        if x:
            push(x - 1, y)
        if x + 1 < w:
            push(x + 1, y)
        if y:
            push(x, y - 1)
        if y + 1 < h:
            push(x, y + 1)
    return rgba


def trim_alpha(im: Image.Image, pad: int = 8) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(im.width, r + pad)
    b = min(im.height, b + pad)
    return im.crop((l, t, r, b))


def save_png(im: Image.Image, name: str) -> None:
    path = DST / name
    im.save(path, "PNG", optimize=True)
    print("wrote", path, im.size)


def main() -> None:
    if LAPTOP_SRC.exists() and not (DST / "hero-full-laptop-v2.png").exists():
        laptop = trim_alpha(knock_edge_black(Image.open(LAPTOP_SRC), 16), 4)
        save_png(laptop, "hero-full-laptop-v2.png")

    phone = trim_alpha(knock_edge_black(Image.open(PHONE_SRC), 12), 4)
    save_png(phone, "hero-full-phone-v3.png")


if __name__ == "__main__":
    main()
