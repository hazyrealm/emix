#!/usr/bin/env python3
"""Generate every Emix icon and logo output from the two brand sources.

Sources (as supplied, never edited):
  assets/brand/emix/icon-source.png   1254x1254 app icon (tile + "Emix" text, glow)
  assets/brand/emix/logo-source.png   1774x887 "Emix" wordmark

Derived masters (written to assets/brand/emix/):
  tile.png        the icon cropped to its rounded tile (glow and stray pixels dropped)
  mark.png        the "E" isolated from the wordmark
  small-tile.png  the "E" on a dark rounded tile: used wherever the full icon's
                  "Emix" lettering would be unreadable (<= 48 px, tray, sidebar)
  wordmark.png    the wordmark trimmed to its artwork

Run from the repo root:  python3 scripts/emix-icons.py   (needs Pillow)
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "assets/brand/emix"
WEB = ROOT / "packages/web/public"
DESKTOP = ROOT / "packages/desktop"
LANDING = ROOT / "deploy/landing"

SURFACE = (10, 9, 18, 255)        # --bg-base, #0a0912
SMALL_MAX = 48                     # app-icon sizes at or below this use small-tile


def trim(im: Image.Image, threshold: int = 20) -> Image.Image:
    return im.crop(im.getchannel("A").point(lambda v: 255 if v > threshold else 0).getbbox())


def resized(im: Image.Image, size: int) -> Image.Image:
    return im.resize((size, size), Image.LANCZOS)


def build_tile(icon: Image.Image) -> Image.Image:
    # Solid tile spans x 82-1172, y 97-1157; a centred square crop keeps it whole.
    return icon.crop((82, 82, 1172, 1172))


def build_mark(logo: Image.Image) -> Image.Image:
    # The "m" touches the E's arms, so it is cut away with a polygon measured on
    # the source (the area right of the middle arm's tip, above and beside the
    # lower arm), feathered by a 2 px blur.
    cut = Image.new("L", logo.size, 0)
    ImageDraw.Draw(cut).polygon(
        [(755, 410), (1000, 410), (1000, 740), (842, 740), (842, 572), (690, 572), (710, 500)], fill=255)
    cut = cut.filter(ImageFilter.GaussianBlur(2))
    m = logo.copy()
    m.putalpha(ImageChops.multiply(logo.getchannel("A"), ImageChops.invert(cut)))
    return trim(m.crop((90, 140, 910, 740)))


def build_small_tile(mark: Image.Image, size: int = 1024) -> Image.Image:
    s = 4  # supersample
    big = size * s
    radius = int(big * 0.2237)
    tile = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    # Vertical dark-violet ground.
    ground = Image.new("RGBA", (big, big))
    top, bottom = (36, 18, 70), (10, 9, 18)
    gd = ImageDraw.Draw(ground)
    for y in range(big):
        t = y / (big - 1)
        gd.line([(0, y), (big, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,))
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=radius, fill=255)
    tile.paste(ground, (0, 0), mask)
    # Pink -> blue diagonal rim.
    rim = Image.new("RGBA", (big, big))
    rd = ImageDraw.Draw(rim)
    pink, blue = (255, 62, 165), (34, 160, 255)
    for x in range(big):
        t = x / (big - 1)
        rd.line([(x, 0), (x, big)], fill=tuple(int(blue[i] + (pink[i] - blue[i]) * t) for i in range(3)) + (255,))
    ring = Image.new("L", (big, big), 0)
    w = max(int(big * 0.035), s)
    ImageDraw.Draw(ring).rounded_rectangle([0, 0, big - 1, big - 1], radius=radius, fill=255)
    ImageDraw.Draw(ring).rounded_rectangle([w, w, big - 1 - w, big - 1 - w], radius=max(radius - w, 0), fill=0)
    tile.paste(rim, (0, 0), ring)
    # The E, centred, 74% of the tile width.
    e = mark.copy()
    target_w = int(big * 0.74)
    e = e.resize((target_w, int(e.height * target_w / e.width)), Image.LANCZOS)
    tile.alpha_composite(e, ((big - e.width) // 2, (big - e.height) // 2))
    return tile.resize((size, size), Image.LANCZOS)


def app_icon(tile: Image.Image, small: Image.Image, size: int) -> Image.Image:
    return resized(small if size <= SMALL_MAX else tile, size)


def on_ground(im: Image.Image, size: int, scale: float) -> Image.Image:
    """Opaque square (apple-touch / maskable): artwork scaled onto the app surface."""
    out = Image.new("RGBA", (size, size), SURFACE)
    inner = resized(im, int(size * scale))
    out.alpha_composite(inner, ((size - inner.width) // 2, (size - inner.height) // 2))
    return out


def template_silhouette(mark: Image.Image, canvas: tuple[int, int], glyph_h: int) -> Image.Image:
    """macOS menu-bar template: black glyph, alpha only."""
    e = mark.resize((int(mark.width * glyph_h / mark.height), glyph_h), Image.LANCZOS)
    a = e.getchannel("A").point(lambda v: 255 if v > 90 else int(v * 2.5))
    glyph = Image.new("RGBA", e.size, (0, 0, 0, 255))
    glyph.putalpha(a)
    out = Image.new("RGBA", canvas, (0, 0, 0, 0))
    out.alpha_composite(glyph, ((canvas[0] - glyph.width) // 2, (canvas[1] - glyph.height) // 2))
    return out


def save(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, optimize=True)
    print(f"  {path.relative_to(ROOT)}  {im.size[0]}x{im.size[1]}")


def main() -> None:
    icon = Image.open(BRAND / "icon-source.png").convert("RGBA")
    logo = Image.open(BRAND / "logo-source.png").convert("RGBA")

    tile = build_tile(icon)
    mark = build_mark(logo)
    small = build_small_tile(mark)
    wordmark = trim(logo)

    print("masters")
    save(resized(tile, 1024), BRAND / "tile.png")
    save(mark, BRAND / "mark.png")
    save(small, BRAND / "small-tile.png")
    save(wordmark, BRAND / "wordmark.png")

    print("web")
    icons = WEB / "icons"
    save(app_icon(tile, small, 16), icons / "favicon-16.png")
    save(app_icon(tile, small, 32), icons / "favicon-32.png")
    save(on_ground(tile, 180, 1.0), icons / "apple-touch-icon.png")
    save(resized(tile, 192), icons / "icon-192.png")
    save(resized(tile, 512), icons / "icon-512.png")
    save(on_ground(tile, 512, 0.78), icons / "icon-maskable-512.png")
    save(resized(tile, 256), icons / "logo.png")
    save(resized(small, 96), icons / "emix-tile.png")             # sidebar home tile (40 css px @2x+)
    wm = wordmark.copy(); wm.thumbnail((720, 360), Image.LANCZOS)
    save(wm, icons / "emix-wordmark.png")                          # login, register, welcome
    m = mark.copy(); m.thumbnail((256, 256), Image.LANCZOS)
    save(m, icons / "emix-mark.png")                               # loading screen
    ico = WEB / "favicon.ico"
    app_icon(tile, small, 48).save(ico, sizes=[(16, 16), (32, 32), (48, 48)],
                                   append_images=[app_icon(tile, small, s) for s in (16, 32)])
    print(f"  {ico.relative_to(ROOT)}  16/32/48")

    print("desktop")
    build = DESKTOP / "build"
    for s in (16, 32, 48, 64, 128, 256, 512, 1024):
        save(app_icon(tile, small, s), build / "icons" / f"{s}x{s}.png")
    save(resized(tile, 512), build / "icon.png")
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    frames = [app_icon(tile, small, s) for s in ico_sizes]
    frames[-1].save(build / "icon.ico", sizes=[(s, s) for s in ico_sizes], append_images=frames[:-1])
    print("  packages/desktop/build/icon.ico  " + "/".join(map(str, ico_sizes)))
    resized(tile, 1024).save(build / "icon.icns")
    print("  packages/desktop/build/icon.icns")
    res = DESKTOP / "resources"
    save(resized(small, 22), res / "tray-icon.png")
    tray_sizes = [16, 20, 24, 32, 40, 48]
    tframes = [resized(small, s) for s in tray_sizes]
    tframes[-1].save(res / "tray-icon.ico", sizes=[(s, s) for s in tray_sizes], append_images=tframes[:-1])
    print("  packages/desktop/resources/tray-icon.ico  " + "/".join(map(str, tray_sizes)))
    save(template_silhouette(mark, (18, 22), 13), res / "tray-iconTemplate.png")
    save(template_silhouette(mark, (36, 44), 26), res / "tray-iconTemplate@2x.png")

    print("landing")
    save(resized(tile, 192), LANDING / "assets/icon-192.png")
    save(resized(tile, 512), LANDING / "assets/icon-512.png")
    wl = wordmark.copy(); wl.thumbnail((960, 480), Image.LANCZOS)
    save(wl, LANDING / "assets/wordmark.png")
    save(app_icon(tile, small, 32), LANDING / "assets/favicon-32.png")
    save(on_ground(tile, 180, 1.0), LANDING / "assets/apple-touch-icon.png")
    ico_l = LANDING / "favicon.ico"
    app_icon(tile, small, 48).save(ico_l, sizes=[(16, 16), (32, 32), (48, 48)],
                                   append_images=[app_icon(tile, small, s) for s in (16, 32)])


if __name__ == "__main__":
    main()
