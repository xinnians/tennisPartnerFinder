# 球咖 2E 微笑球：風格延伸 v2

日期：2026-08-14

## 結論

四款都能在 48px 保留「網球＋笑臉」辨識。若把 2E 發展成完整識別系統，建議以「台日角色貼紙版」作為主要彩色角色，以「單色印章版」作為功能性副標；極簡幾何版適合 App 小圖示，復古球會版則留給社群活動與周邊。

| 方向 | 最強優點 | 主要風險 | 建議用途 |
|---|---|---|---|
| 極簡幾何 | 最接近正式科技產品 Logo，縮小清楚 | 個性與原版相近，縫線末端需重繪 | App icon、favicon、導覽圖示 |
| 復古球會 | 社群與俱樂部氣氛最強 | 多一層外圈，小尺寸較擁擠 | 活動章、帽章、球袋、球衣 |
| 台日角色貼紙 | 壓扁輪廓和小表情最有自有個性 | 需控制可愛度，避免變成兒童品牌 | 主吉祥物、空狀態、貼圖、社群 |
| 單色印章 | 黑白、刺繡、雷雕仍成立，品牌最耐用 | 彩色情緒較少 | 單色 Logo、印章、浮水印、實體製作 |

## 48px 測試

由左至右：極簡幾何、復古球會、台日角色貼紙、單色印章。

![2E 風格 48px 測試](generated/2e-48px-test-v2.png)

## 產出

- [極簡幾何](generated/2e-geometric-v2.png)
- [復古球會](generated/2e-retro-club-v2.png)
- [台日角色貼紙](generated/2e-sticker-v2.png)
- [單色印章](generated/2e-monochrome-v2.png)

這些是 AI raster 構圖探索，不是最終向量稿。模型仍加入了非常輕微的明暗變化；正式 SVG 應改成純色面，並統一縫線、眼睛、笑線與外框的光學粗細。

## 最終生成 prompts

以下均使用內建 ImageGen，並以 `2e-smile-flat-v1.png` 作為概念參考。

### 極簡幾何

```text
Use case: logo-brand
Asset type: alternative flat logo mark for "球咖" (Qiu-Ka), a friendly Taiwanese tennis matchmaking app
Input images: Image 1 is a concept reference; preserve only its core idea of a smiling orange tennis-ball face framed by two tennis seam curves, but redesign the geometry cleanly
Primary request: ultra-minimal geometric version of the smiling tennis-ball mark. Use one perfect orange circle, exactly two symmetric cream tennis seam curves, two small deep-ink circular eyes, and one restrained deep-ink smile arc. Make every curve optically balanced and every stroke feel intentionally related.
Scene/backdrop: perfectly uniform solid warm cream #F7F1E2 background edge to edge
Style/medium: Swiss-Japanese geometric logo design, flat vector-like shapes, crisp hard edges, simple enough for exact SVG reconstruction
Composition/framing: one centered mark filling 58% of a square canvas, generous clear space
Color palette: tennis-ball orange #E2762C, warm cream #F7F1E2, deep ink green #1C2A1F only
Text: none
Constraints: strong circular silhouette, unmistakably a tennis ball rather than baseball, readable at 24–48 px, exactly two eyes and one smile, no additional facial features
Avoid: text, letters, watermark, gradients, lighting, highlights, shadows, texture, transparency, mockup, badge border, limbs, racket, blush, tongue, emoji styling, clipart, 3D, bevel, plastic look
```

### 復古球會

```text
Use case: logo-brand
Asset type: alternative heritage-club logo mark for "球咖" (Qiu-Ka), a friendly Taiwanese tennis matchmaking app
Input images: Image 1 is a concept reference; preserve the recognizable smiling orange tennis-ball face and two tennis seam curves, but reinterpret the visual language
Primary request: a restrained retro Taiwanese neighborhood tennis-club emblem from the late 1970s, featuring one smiling orange tennis-ball face inside a simple circular cream-and-green badge. Friendly local club character, nostalgic but clean, suitable for embroidery and screen printing.
Scene/backdrop: perfectly uniform solid warm cream #F7F1E2 background edge to edge
Style/medium: flat vintage sports-club graphic, bold simplified vector-like forms, subtly irregular hand-drawn warmth without distressed texture
Composition/framing: one centered circular badge filling 62% of a square canvas, balanced rings and generous outer margin
Color palette: court green #2E6B40, tennis-ball orange #E2762C, warm cream #F7F1E2, deep ink green #1C2A1F only
Text: none
Constraints: face has exactly two eyes and one smile; ball has exactly two symmetric cream seam curves; clear at 32–48 px; maximum four solid color areas; rounded line ends
Avoid: all text, letters, numbers, watermark, gradients, highlights, shadows, texture, distress, mockup, ribbon, laurel, stars, racket, limbs, blush, tongue, childish cartoon, clipart, 3D, bevel, plastic look
```

### 台日角色貼紙

```text
Use case: logo-brand
Asset type: alternative mascot sticker mark for "球咖" (Qiu-Ka), a friendly Taiwanese tennis matchmaking app
Input images: Image 1 is a concept reference; keep its smiling orange tennis-ball identity and two seam curves, but develop a more characterful silhouette
Primary request: a warm Taiwanese-Japanese character-sticker interpretation of the smiling tennis ball. Use a slightly squashed, pleasantly imperfect orange ball shape with a thick deep-ink outline, exactly two cream tennis seam curves, two tiny oval eyes, and one small friendly smile. The expression should feel quietly welcoming, not hyper-cute.
Scene/backdrop: perfectly uniform solid warm cream #F7F1E2 background edge to edge
Style/medium: flat vector sticker illustration, bold clean outline, restrained character design, screen-print friendly
Composition/framing: one centered mascot head filling 58% of a square canvas, generous clear space, very slight playful tilt
Color palette: tennis-ball orange #E2762C, court green #2E6B40, warm cream #F7F1E2, deep ink green #1C2A1F only
Text: none
Constraints: recognizable at 32–48 px, strong non-circular character silhouette, exactly two eyes and one smile, exactly two tennis seam curves, consistent rounded outline
Avoid: text, letters, watermark, gradients, lighting, highlights, shadows, texture, mockup, extra sticker objects, limbs, hands, feet, racket, blush, tongue, open mouth, sparkles, anime eyes, emoji look, childish cartoon, clipart, 3D, bevel, plastic look
```

### 單色印章

```text
Use case: logo-brand
Asset type: one-color utility logo mark for "球咖" (Qiu-Ka), a friendly Taiwanese tennis matchmaking app
Input images: Image 1 is a concept reference; preserve its smiling tennis-ball identity but reduce it to a rigorous single-ink mark
Primary request: a monochrome smiling tennis-ball symbol constructed from one bold circular outline, exactly two curved tennis seams, two dot eyes, and one smile arc. Use negative space and uniform rounded strokes so the mark works as a rubber stamp, embroidery, laser engraving, favicon, and one-color print.
Scene/backdrop: perfectly uniform solid warm cream #F7F1E2 background edge to edge
Style/medium: one-color monoline vector logo, modern seal-mark simplicity, precise geometry, no decorative detail
Composition/framing: one centered circular mark filling 56% of a square canvas, generous clear space
Color palette: deep ink green #1C2A1F only on warm cream #F7F1E2
Text: none
Constraints: exactly one ink color, closed coherent silhouette, equal visual stroke weight, rounded caps, unmistakably a tennis ball, readable at 16–32 px, exactly two eyes and one smile
Avoid: orange, additional colors, text, letters, watermark, gradients, lighting, highlights, shadows, texture, distress, mockup, badge rings, limbs, racket, blush, tongue, childish cartoon, emoji look, clipart, 3D, bevel
```

## `#DDF53C` 配色預覽

左側為原始橘色，右側為 `#DDF53C` 網球黃綠。

![橘色與 DDF53C 比較](generated/2e-sticker-orange-vs-lime-v3.png)

- [精確純色版](generated/2e-sticker-lime-ddf53c-v3.png)
- [ImageGen 原始編修版](generated/2e-sticker-lime-ddf53c-imagegen-v3.png)

內建 ImageGen 用以下 prompt 進行單一色彩編修；由於模型仍加入輕微明暗，最終另以本地色彩校正把球體中心與主要色面正規化為精確的 `rgb(221,245,60)`／`#DDF53C`。

```text
Use case: precise-object-edit
Asset type: colorway preview for the "球咖" 2E smiling tennis-ball mascot
Input images: Image 1 is the edit target
Primary request: change only the orange fill of the tennis-ball body to the exact solid fluorescent tennis-ball yellow-green color #DDF53C
Constraints: preserve the mascot's exact silhouette, slight tilt, proportions, two cream seam curves, two oval eyes, smile, deep ink-green outline, warm cream background, framing, spacing, and canvas size; keep all non-orange pixels and all geometry unchanged; render the new ball fill as one uniform flat #DDF53C color with no gradient, highlight, shadow, texture, or lighting variation; no text; no watermark
Avoid: redesigning the face, changing line thickness, moving or reshaping seams, changing the background, adding objects, gradients, shadows, glow, texture, 3D effects
```
