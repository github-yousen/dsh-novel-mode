"""Generate the catalog raster icon and a capability screenshot (PNG).

Uses only Pillow (bundled with the harness). No network, no credentials.
Run: python assets/make-icons.py
Outputs (in the repo, GitHub-hostable):
  assets/icon-180.png      square catalog tile (180x180)
  assets/screenshot-1.png  capability screenshot (1200x675)
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))

def font(size, bold=False):
    for path in [
        r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
    ]:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()

def gradient(w, h, c1, c2):
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x / max(1, w - 1) + y / max(1, h - 1)) / 2
            px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return img

def book_glyph(draw, cx, cy, scale, color):
    """An open book drawn with vector primitives."""
    w = 46 * scale
    h = 34 * scale
    # left/right pages
    draw.polygon([(cx - 2, cy - h/2), (cx - w, cy - h/2 + 6), (cx - w, cy + h/2 - 6), (cx - 2, cy + h/2)], fill=color)
    draw.polygon([(cx + 2, cy - h/2), (cx + w, cy - h/2 + 6), (cx + w, cy + h/2 - 6), (cx + 2, cy + h/2)], fill=color)
    # spine
    draw.rectangle([cx - 2, cy - h/2, cx + 2, cy + h/2], fill=(255, 255, 255))
    # page lines
    for yy in (cy - 8, cy, cy + 8):
        draw.line([(cx - w + 8, yy), (cx - 8, yy)], fill=(45, 108, 223), width=max(1, int(2*scale)))
        draw.line([(cx + 8, yy), (cx + w - 8, yy)], fill=(45, 108, 223), width=max(1, int(2*scale)))

def make_icon():
    img = gradient(180, 180, (45, 108, 223), (122, 63, 208))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([6, 6, 173, 173], radius=34, outline=(255, 255, 255, 0), width=2)
    book_glyph(d, 90, 86, 1.35, (255, 255, 255))
    # small "NM" tag
    d.rounded_rectangle([58, 138, 122, 164], radius=12, fill=(255, 255, 255))
    d.text((90, 151), "NM", font=font(15, True), fill=(45, 108, 223), anchor="mm")
    img.save(os.path.join(HERE, "icon-180.png"))
    print("wrote icon-180.png")

def make_screenshot():
    W, H = 1200, 675
    img = gradient(W, H, (24, 30, 46), (34, 42, 66))
    d = ImageDraw.Draw(img)
    # window chrome
    d.rounded_rectangle([40, 40, W-40, H-40], radius=18, fill=(30, 37, 56), outline=(70, 82, 110), width=2)
    d.text((72, 78), "小说模式  ·  Novel Mode", font=font(30, True), fill=(235, 240, 250))
    d.text((72, 120), "确定性写作引擎  —  状态由代码裁决，不由提示词裁决", font=font(18), fill=(160, 175, 200))

    stages = ["宪法", "大纲", "设计", "写作", "校验", "批量", "导出"]
    x0, y, step = 72, 210, 150
    for i, s in enumerate(stages):
        color = (46, 160, 110) if i < 4 else ((90, 110, 145) if i == 4 else (60, 72, 98))
        d.rounded_rectangle([x0 + i*step, y, x0 + i*step + 120, y + 62], radius=12, fill=color)
        d.text((x0 + i*step + 60, y + 31), s, font=font(22, True), fill=(255, 255, 255), anchor="mm")
        if i < len(stages) - 1:
            d.line([x0 + i*step + 122, y + 31, x0 + (i+1)*step - 4, y + 31], fill=(120, 140, 175), width=3)

    rows = [
        ("当前阶段", "写作  ·  第 16 / 100 章"),
        ("硬门禁", "validate-chapter.ps1  PASS  ·  13 项检测"),
        ("断点", "checkpoint v2  ·  可恢复  ·  幂等"),
        ("子代理裁决", "证据优先  ·  无证据 PASS 不放行"),
        ("用户可见", "仅结构化状态  ·  无提示词  ·  无错误"),
    ]
    ry = 320
    for k, v in rows:
        d.text((90, ry), k, font=font(19, True), fill=(130, 165, 225))
        d.text((300, ry), v, font=font(19), fill=(225, 232, 245))
        ry += 52

    d.rounded_rectangle([90, 600, 360, 638], radius=10, fill=(45, 108, 223))
    d.text((225, 619), "已保存进度，可继续", font=font(18, True), fill=(255, 255, 255), anchor="mm")
    img.save(os.path.join(HERE, "screenshot-1.png"))
    print("wrote screenshot-1.png")

if __name__ == "__main__":
    make_icon()
    make_screenshot()
