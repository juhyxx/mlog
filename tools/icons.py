#!/usr/bin/env python3
"""Draws Mlog's icons from one pixel grid: a glowing salamander on the dark panel tile.

Writes img/icon.svg (favicon), icon-192.png, icon-512.png, maskable-512.png and apple-touch-icon.png,
and prints the SVG path of the salamander for the header in index.html. Plain Python, no dependencies:
    python3 tools/icons.py
"""
import math
import os
import struct
import zlib

MARK = [  # a fire salamander ("mlok" in Czech) from above, with a spot on its back
    '.......####.......',
    '......######......',
    '.....#.####.#.....',
    '......######......',
    '.......####.......',
    '.......####.......',
    '..#.#..####..#.#..',
    '...#..######..#...',
    '...############...',
    '.......####.......',
    '.......#.##.......',
    '.......####.......',
    '...############...',
    '...#..######..#...',
    '..#.#..####..#.#..',
    '........###.......',
    '........###.......',
    '.........###......',
    '..........###..#..',
    '...........#####..',
    '............###...',
]
W, H = len(MARK[0]), len(MARK)
LED = (255, 120, 31)  # hsl(24, 100%, 56%), --led in src/styles.css
PANEL = (28, 28, 28)  # #1c1c1c
OUT = os.path.join(os.path.dirname(__file__), '..', 'img')
SCALE = 0.62  # the mark's height, of the icon's


def path():
    """The mark as one SVG path, a rectangle per run of pixels in a row."""
    d = []
    for y, row in enumerate(MARK):
        x = 0
        while x < W:
            if row[x] == '#':
                end = x
                while end < W and row[end] == '#':
                    end += 1
                d.append(f'M{x} {y}h{end - x}v1h-{end - x}z')
                x = end
            else:
                x += 1
    return ''.join(d)


def blur(img, size, r):
    """Three box blurs in each direction, close to a gaussian."""
    win = 2 * r + 1
    for _ in range(3):
        for horizontal in (True, False):
            out = [0.0] * (size * size)
            for a in range(size):
                line = img[a * size:(a + 1) * size] if horizontal else img[a::size]
                acc = sum(line[:r])  # the window around b runs from b - r to b + r
                for b in range(size):
                    if b + r < size:
                        acc += line[b + r]
                    if b - r - 1 >= 0:
                        acc -= line[b - r - 1]
                    if horizontal:
                        out[a * size + b] = acc / win
                    else:
                        out[b * size + a] = acc / win
            img = out
    return img


def render(size, scale, rounded, transparent):
    cell = max(1, round(size * scale / H))
    ox = (size - cell * W) // 2
    oy = (size - cell * H) // 2
    mask = [0.0] * (size * size)
    for y, row in enumerate(MARK):
        for x, ch in enumerate(row):
            if ch == '#':
                for py in range(oy + y * cell, oy + (y + 1) * cell):
                    base = py * size
                    for px in range(ox + x * cell, ox + (x + 1) * cell):
                        mask[base + px] = 1.0
    glow = blur(mask, size, max(1, round(cell * 0.8)))
    radius = size * 0.22 if rounded else 0
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            # the tile, with a faint sheen from the top left
            sheen = max(0.0, 1 - math.hypot(x, y) / (size * 1.2)) * 0.1
            c = [p + (255 - p) * sheen for p in PANEL]
            g = min(1.0, glow[y * size + x] * 1.1) * 0.75
            c = [cc + (l - cc) * g for cc, l in zip(c, LED)]
            if mask[y * size + x]:
                c = list(LED)
            alpha = 255
            if radius:  # rounded corners, antialiased
                dx = max(0.0, radius - x - 0.5, x + 0.5 - (size - radius))
                dy = max(0.0, radius - y - 0.5, y + 0.5 - (size - radius))
                if dx and dy:
                    alpha = round(255 * min(1.0, max(0.0, radius - math.hypot(dx, dy) + 0.5)))
            if not transparent:
                alpha = 255
            rows += bytes(round(v) for v in c) + bytes([alpha])
    return rows


def png(file, size, rows):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    data += chunk(b'IDAT', zlib.compress(bytes(rows), 9)) + chunk(b'IEND', b'')
    with open(os.path.join(OUT, file), 'wb') as f:
        f.write(data)
    print(file, len(data), 'bytes')


def svg():
    s = 512
    cell = s * SCALE / H
    tx, ty = (s - cell * W) / 2, (s - cell * H) / 2
    body = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {s} {s}">
  <!-- tools/icons.py draws this: the salamander from the header on the panel tile shared with Scalear. -->
  <defs>
    <radialGradient id="sheen" cx="0" cy="0" r="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".1"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="{cell * 0.5:.1f}"/></filter>
  </defs>
  <rect width="{s}" height="{s}" rx="112" fill="#1c1c1c"/>
  <rect width="{s}" height="{s}" rx="112" fill="url(#sheen)"/>
  <g transform="translate({tx:.2f} {ty:.2f}) scale({cell:.3f})" fill="#ff781f" shape-rendering="crispEdges">
    <path d="{path()}" filter="url(#glow)" opacity=".8"/>
    <path d="{path()}"/>
  </g>
</svg>
'''
    with open(os.path.join(OUT, 'icon.svg'), 'w') as f:
        f.write(body)
    print('icon.svg')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    svg()
    png('icon-192.png', 192, render(192, SCALE, True, True))
    png('icon-512.png', 512, render(512, SCALE, True, True))
    png('maskable-512.png', 512, render(512, 0.5, False, False))  # the mark inside the safe circle
    png('apple-touch-icon.png', 180, render(180, SCALE, False, False))  # iOS rounds it itself
    print(f'header path (viewBox 0 0 {W} {H}):', path())
