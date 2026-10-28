"""IAP 상품 아이콘 1024x1024 (토스 콘솔·스토어 공용). 앱 아이콘 위에 하단 띠와 상품 이름을 얹는다.
사용: python3 scripts/iap_icons.py  -> toss/iap/<key>.png"""
from PIL import Image, ImageDraw, ImageFont
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
ITEMS = {"adfree": ("광고 제거", "#2f6f5e"), "coins_s": ("진료비 2,500", "#b9822b"), "coins_m": ("진료비 12,000", "#8a3b3b")}
base = Image.open(os.path.join(ROOT, "toss/icon-600.png")).convert("RGB").resize((1024, 1024), Image.LANCZOS)
os.makedirs(os.path.join(ROOT, "toss/iap"), exist_ok=True)
for key, (name, color) in ITEMS.items():
    im = base.copy(); d = ImageDraw.Draw(im)
    d.rectangle([0, 740, 1024, 1024], fill=color)
    f = ImageFont.truetype(FONT, 120, index=6)
    w = d.textlength(name, font=f)
    d.text(((1024 - w) / 2, 800), name, font=f, fill="white")
    im.save(os.path.join(ROOT, f"toss/iap/{key}.png"))
