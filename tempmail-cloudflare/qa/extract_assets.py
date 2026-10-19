#!/usr/bin/env python3
"""Feathered-crop extraction: illustration regions keep original pixels,
edges fade to transparent; optional erase rects remove stray UI bits."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

SRC = Path('/Users/inkyu/Downloads/tempmail-design')
OUT = Path(__file__).resolve().parent.parent / 'frontend' / 'public' / 'assets' / 'tempmail'
OUT.mkdir(parents=True, exist_ok=True)

# (source png, crop box, name, feather, erase rects in crop coords)
JOBS = [
    # 홈 히어로: 고양이+봉투+구름만 (h1 시작 ~y560 이므로 545에서 자름)
    ('01_PRIMARY_19_5_9/01_home_create.png',      (120, 130, 852, 478),  'cat-hero.png', 60, []),
    ('01_PRIMARY_19_5_9/02_inbox.png',            (430, 40, 852, 370),   'cat-mailbox.png', 45,
        [(180, 0, 422, 110)]),  # 상단 검색/작성 버튼 지우기
    ('01_PRIMARY_19_5_9/03_message_detail.png',   (540, 520, 852, 880),  'cat-peek.png', 55, []),
    ('01_PRIMARY_19_5_9/04_compose.png',          (460, 40, 852, 500),   'cat-compose.png', 55, []),
    ('01_PRIMARY_19_5_9/05_recipient_picker.png', (30, 170, 480, 520),   'cat-picker.png', 55,
        [(385, 15, 450, 185), (0, 300, 450, 350)]),  # 말풍선 잔여 + 하단 텍스트
    ('01_PRIMARY_19_5_9/06_send_success.png',     (20, 150, 852, 860),   'cat-plane.png', 70, []),
    # 로고 배지 (852 기준 좌상단)
    ('01_PRIMARY_19_5_9/01_home_create.png',      (30, 20, 112, 104),    'logo-badge.png', 6, []),
    # 데스크톱: 피처 카드 텍스트 위에서 자르기
    ('03_DESKTOP_REFERENCES/01_desktop_home.png', (40, 140, 470, 540),   'cat-hero-desktop.png', 55, []),
    ('03_DESKTOP_REFERENCES/01_desktop_home.png', (1180, 265, 1580, 575),'mailbox-desktop.png', 55,
        [(0, 250, 400, 310), (250, 0, 400, 100)]),  # 하단 카드 가장자리 + 우상단 텍스트 지우기
]

def feather_mask(w: int, h: int, feather: int) -> Image.Image:
    mask = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([feather, feather, w - feather, h - feather], radius=feather, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(feather * 0.55))

for src, box, name, feather, erases in JOBS:
    im = Image.open(SRC / src).convert('RGBA')
    crop = im.crop(box)
    if erases:
        blur_bg = crop.filter(ImageFilter.GaussianBlur(40))  # 주변 그라데이션으로 채우기
        for r in erases:
            crop.paste(blur_bg.crop(r), r)
    mask = feather_mask(crop.width, crop.height, feather)
    crop.putalpha(mask)
    crop.save(OUT / name)
    print(f'{name}: {crop.size}')
