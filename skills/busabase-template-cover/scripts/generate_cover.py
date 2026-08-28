#!/usr/bin/env python3
"""Generate the standardized Busabase template gallery cover."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


CANVAS_SIZE = (1440, 900)
COVER_RELATIVE_PATH = Path("assets/screenshots/cover.webp")
SAFE_HORIZONTAL_INSET = 120
SAFE_VERTICAL_INSET = 72
TITLE_DESCRIPTION_GAP = 28
DESCRIPTION_SCREENSHOT_GAP = 44
SKILL_DIR = Path(__file__).resolve().parent.parent
FONT_DIR = SKILL_DIR / "assets/fonts"
INTER_FONT = FONT_DIR / "Inter-Variable.ttf"
FRAUNCES_FONT = FONT_DIR / "Fraunces-Variable.ttf"
NOTO_SERIF_SC_FONT = FONT_DIR / "NotoSerifSC-Variable.ttf"

COLORS = {
    "background": "#F1F3F3",
    "ink": "#161818",
    "muted": "#6F7373",
    "dot_strong": "#DCE0DF",
    "dot_medium": "#E3E6E5",
    "dot_soft": "#E9EBEA",
}

SANS_FALLBACKS = (
    "/System/Library/Fonts/SFNS.ttf",
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
)

SERIF_FALLBACKS = (
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
    "/System/Library/Fonts/Supplemental/Songti.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
)

ACRONYMS = {"ai", "api", "b2b", "b2c", "crm", "erp", "hr", "sdk", "ui", "ux"}


class CoverError(RuntimeError):
    """Raised when a template cannot produce a valid cover."""


def contains_cjk(text: str) -> bool:
    return any(
        "\u3400" <= character <= "\u4dbf"
        or "\u4e00" <= character <= "\u9fff"
        or "\uf900" <= character <= "\ufaff"
        for character in text
    )


def apply_font_axes(font: ImageFont.FreeTypeFont, *, size: int, weight: int) -> None:
    try:
        axes = font.get_variation_axes()
    except (AttributeError, OSError):
        return
    values: list[float] = []
    for axis in axes:
        name = axis["name"].decode("ascii", errors="ignore").lower()
        value = axis["default"]
        if "weight" in name:
            value = weight
        elif "optical" in name:
            value = size
        values.append(max(axis["minimum"], min(axis["maximum"], value)))
    try:
        font.set_variation_by_axes(values)
    except (OSError, ValueError):
        pass


def load_font(
    size: int,
    *,
    family: str,
    weight: int,
    text: str = "",
) -> ImageFont.FreeTypeFont:
    if family == "display":
        primary = NOTO_SERIF_SC_FONT if contains_cjk(text) else FRAUNCES_FONT
        candidates = (str(primary), *SERIF_FALLBACKS)
    else:
        candidates = (str(INTER_FONT), *SANS_FALLBACKS)
    for candidate in candidates:
        path = Path(candidate)
        if not path.exists():
            continue
        try:
            font = ImageFont.truetype(str(path), size=size)
            apply_font_axes(font, size=size, weight=weight)
            return font
        except OSError:
            continue
    raise CoverError("No supported system font was found")


def display_name(raw_name: str) -> str:
    words = raw_name.replace("_", "-").split("-")
    return " ".join(word.upper() if word.lower() in ACRONYMS else word.capitalize() for word in words if word)


def text_width(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont) -> float:
    return draw.textlength(text, font=font)


def split_long_token(draw: ImageDraw.ImageDraw, token: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    chunks: list[str] = []
    current = ""
    for character in token:
        candidate = current + character
        if current and text_width(draw, candidate, font) > max_width:
            chunks.append(current)
            current = character
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


def wrap_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.FreeTypeFont,
    max_width: int,
    max_lines: int,
) -> list[str]:
    normalized = " ".join(text.split())
    if not normalized:
        return []

    tokens = normalized.split(" ") if " " in normalized else list(normalized)
    lines: list[str] = []
    current = ""
    separator = " " if " " in normalized else ""

    for token in tokens:
        pieces = [token]
        if text_width(draw, token, font) > max_width:
            pieces = split_long_token(draw, token, font, max_width)
        for piece in pieces:
            candidate = f"{current}{separator if current else ''}{piece}"
            if current and text_width(draw, candidate, font) > max_width:
                lines.append(current)
                current = piece
            else:
                current = candidate
    if current:
        lines.append(current)

    if len(lines) <= max_lines:
        return lines

    lines = lines[:max_lines]
    final = lines[-1]
    while final and text_width(draw, final + "...", font) > max_width:
        final = final[:-1].rstrip()
    lines[-1] = final + "..."
    return lines


def draw_centered_lines(
    draw: ImageDraw.ImageDraw,
    lines: list[str],
    center_x: int,
    top: int,
    font: ImageFont.FreeTypeFont,
    fill: str,
    line_gap: int,
) -> int:
    cursor_y = top
    visual_bottom = top
    for line in lines:
        left, glyph_top, right, glyph_bottom = draw.textbbox((0, 0), line, font=font)
        line_width = right - left
        line_height = glyph_bottom - glyph_top
        draw.text(
            (center_x - line_width / 2 - left, cursor_y - glyph_top),
            line,
            font=font,
            fill=fill,
        )
        visual_bottom = cursor_y + line_height
        cursor_y = visual_bottom + line_gap
    return visual_bottom


def draw_dot_matrix(draw: ImageDraw.ImageDraw) -> None:
    step = 32
    radius = 1
    center_x = CANVAS_SIZE[0] / 2
    half_width = CANVAS_SIZE[0] / 2
    for y in range(step // 2, CANVAS_SIZE[1], step):
        for x in range(step // 2, CANVAS_SIZE[0], step):
            edge_strength = abs(x - center_x) / half_width
            if edge_strength >= 0.68:
                fill = COLORS["dot_strong"]
            elif edge_strength >= 0.4:
                fill = COLORS["dot_medium"]
            else:
                fill = COLORS["dot_soft"]
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def rounded_image(image: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, image.width, image.height), radius=radius, fill=255)
    result = image.convert("RGBA")
    result.putalpha(mask)
    return result


def add_ambient_shadow(
    image: Image.Image,
    box: tuple[int, int, int, int],
    radius: int,
) -> Image.Image:
    layers = (
        (28, 52, 18, (22, 24, 24, 24)),
        (9, 16, 5, (22, 24, 24, 25)),
    )
    result = image.convert("RGBA")
    left, top, right, bottom = box
    for offset_y, blur_radius, spread, color in layers:
        shadow = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
        shadow_draw = ImageDraw.Draw(shadow)
        shadow_draw.rounded_rectangle(
            (left - spread, top + offset_y - spread, right + spread, bottom + offset_y + spread),
            radius=radius + spread,
            fill=color,
        )
        shadow = shadow.filter(ImageFilter.GaussianBlur(blur_radius))
        result = Image.alpha_composite(result, shadow)
    return result


def resolve_source(template_dir: Path, screenshots: list[str], source_override: str | None) -> tuple[Path, str]:
    candidates = [source_override] if source_override else [
        screenshot for screenshot in screenshots if Path(screenshot).as_posix() != COVER_RELATIVE_PATH.as_posix()
    ]
    for candidate in candidates:
        if not candidate:
            continue
        path = Path(candidate)
        resolved = path if path.is_absolute() else template_dir / path
        if resolved.is_file():
            try:
                label = resolved.relative_to(template_dir).as_posix()
            except ValueError:
                label = str(resolved)
            return resolved, label
    raise CoverError("No real non-cover screenshot is available; add one to template.screenshots first")


def read_manifest(template_dir: Path) -> tuple[Path, dict]:
    manifest_path = template_dir / "busabase.json"
    if not manifest_path.is_file():
        raise CoverError(f"Missing manifest: {manifest_path}")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise CoverError(f"Cannot read {manifest_path}: {error}") from error
    template = manifest.get("template")
    if not isinstance(template, dict):
        raise CoverError(f"Missing template object in {manifest_path}")
    screenshots = template.get("screenshots")
    if not isinstance(screenshots, list) or not all(isinstance(value, str) for value in screenshots):
        raise CoverError(f"template.screenshots must be a string array in {manifest_path}")
    return manifest_path, manifest


def draw_cover(manifest: dict, screenshot_path: Path, title_override: str | None) -> Image.Image:
    if max(TITLE_DESCRIPTION_GAP, DESCRIPTION_SCREENSHOT_GAP) >= SAFE_VERTICAL_INSET:
        raise CoverError("Internal vertical gaps must be smaller than the vertical safe inset")

    image = Image.new("RGB", CANVAS_SIZE, COLORS["background"])
    draw = ImageDraw.Draw(image)
    draw_dot_matrix(draw)

    raw_name = str(manifest.get("name") or "Template")
    title = title_override or display_name(raw_name)
    description = str(manifest.get("description") or "A ready-to-install Busabase workspace template.")

    safe_left = SAFE_HORIZONTAL_INSET
    safe_top = SAFE_VERTICAL_INSET
    safe_right = CANVAS_SIZE[0] - SAFE_HORIZONTAL_INSET
    safe_bottom = CANVAS_SIZE[1] - SAFE_VERTICAL_INSET
    safe_width = safe_right - safe_left
    center_x = CANVAS_SIZE[0] // 2
    title_font = load_font(74, family="display", weight=600, text=title)
    title_lines = wrap_text(draw, title, title_font, safe_width, 2)
    title_bottom = draw_centered_lines(
        draw,
        title_lines,
        center_x,
        safe_top,
        title_font,
        COLORS["ink"],
        10,
    )

    body_font = load_font(26, family="sans", weight=400, text=description)
    description_max_width = safe_width - 180
    description_top = title_bottom + TITLE_DESCRIPTION_GAP
    description_lines = wrap_text(draw, description, body_font, description_max_width, 3)
    description_bottom = draw_centered_lines(
        draw,
        description_lines,
        center_x,
        description_top,
        body_font,
        COLORS["muted"],
        9,
    )

    screenshot_width = safe_width
    screenshot_x = safe_left
    screenshot_y = description_bottom + DESCRIPTION_SCREENSHOT_GAP
    for label, lines, font, top, bottom in (
        ("title", title_lines, title_font, safe_top, title_bottom),
        ("description", description_lines, body_font, description_top, description_bottom),
    ):
        widest = max((text_width(draw, line, font) for line in lines), default=0)
        if widest > safe_width or top < safe_top or bottom > safe_bottom:
            raise CoverError(f"{label.capitalize()} exceeds the cover safe area")
    if screenshot_x < safe_left or screenshot_x + screenshot_width > safe_right:
        raise CoverError("Screenshot exceeds the horizontal safe area")
    if not safe_top <= screenshot_y <= safe_bottom:
        raise CoverError("Screenshot top exceeds the vertical safe area")

    with Image.open(screenshot_path) as screenshot:
        screenshot = screenshot.convert("RGB")
        screenshot_height = round(screenshot.height * screenshot_width / screenshot.width)
        resized = screenshot.resize((screenshot_width, screenshot_height), Image.Resampling.LANCZOS)
    resized = rounded_image(resized, radius=8)
    screenshot_box = (
        screenshot_x,
        screenshot_y,
        screenshot_x + screenshot_width,
        screenshot_y + screenshot_height,
    )
    image = add_ambient_shadow(image, screenshot_box, radius=8)
    image.alpha_composite(resized, (screenshot_x, screenshot_y))

    return image.convert("RGB")


def update_manifest(manifest_path: Path, manifest: dict) -> bool:
    screenshots = manifest["template"]["screenshots"]
    cover = COVER_RELATIVE_PATH.as_posix()
    updated = [cover, *(value for value in screenshots if Path(value).as_posix() != cover)]
    if updated == screenshots:
        return False
    manifest["template"]["screenshots"] = updated
    source = manifest_path.read_text(encoding="utf-8")
    array_pattern = re.compile(
        r'(?ms)^(?P<indent>[ \t]*)"screenshots"[ \t]*:[ \t]*\[.*?^(?P=indent)\]'
    )
    match = array_pattern.search(source)
    if not match:
        raise CoverError(f"Cannot locate the formatted template.screenshots array in {manifest_path}")
    indent = match.group("indent")
    item_indent = indent + "  "
    rendered_items = ",\n".join(
        f"{item_indent}{json.dumps(value, ensure_ascii=False)}" for value in updated
    )
    replacement = f'{indent}"screenshots": [\n{rendered_items}\n{indent}]'
    updated_source = source[: match.start()] + replacement + source[match.end() :]
    manifest_path.write_text(updated_source, encoding="utf-8")
    return True


def validate_cover(template_dir: Path) -> None:
    _, manifest = read_manifest(template_dir)
    screenshots = manifest["template"]["screenshots"]
    cover = COVER_RELATIVE_PATH.as_posix()
    if not screenshots or Path(screenshots[0]).as_posix() != cover:
        raise CoverError(f"{template_dir}: {cover} is not template.screenshots[0]")
    cover_path = template_dir / COVER_RELATIVE_PATH
    if not cover_path.is_file():
        raise CoverError(f"Missing cover: {cover_path}")
    with Image.open(cover_path) as image:
        if image.size != CANVAS_SIZE:
            raise CoverError(f"{cover_path} is {image.width}x{image.height}, expected 1440x900")
        if image.format != "WEBP":
            raise CoverError(f"{cover_path} is {image.format}, expected WEBP")
    resolve_source(template_dir, screenshots, None)


def generate(template_dir: Path, source_override: str | None, title_override: str | None) -> tuple[Path, str, bool]:
    template_dir = template_dir.resolve()
    manifest_path, manifest = read_manifest(template_dir)
    screenshot_path, screenshot_label = resolve_source(
        template_dir,
        manifest["template"]["screenshots"],
        source_override,
    )
    cover = draw_cover(manifest, screenshot_path, title_override)
    output_path = template_dir / COVER_RELATIVE_PATH
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cover.save(output_path, format="WEBP", quality=92, method=6)
    manifest_updated = update_manifest(manifest_path, manifest)
    validate_cover(template_dir)
    return output_path, screenshot_label, manifest_updated


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("template_dirs", nargs="+", type=Path, help="Template directories containing busabase.json")
    parser.add_argument("--source", help="Screenshot path relative to the template directory, or an absolute path")
    parser.add_argument("--title", help="Cover title override; valid only with one template directory")
    parser.add_argument("--check", action="store_true", help="Validate existing covers without changing files")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if (args.source or args.title) and len(args.template_dirs) != 1:
        print("error: --source and --title require exactly one template directory", file=sys.stderr)
        return 2

    failed = False
    for template_dir in args.template_dirs:
        try:
            if args.check:
                validate_cover(template_dir.resolve())
                print(f"OK {template_dir}: cover is first, 1440x900 WEBP, with a real source screenshot")
            else:
                output_path, source, manifest_updated = generate(template_dir, args.source, args.title)
                update_label = "updated" if manifest_updated else "already first"
                print(f"OK {template_dir}: {output_path} from {source}; manifest {update_label}")
        except (CoverError, OSError) as error:
            failed = True
            print(f"ERROR {template_dir}: {error}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
