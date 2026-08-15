# 球咖微笑球：正式候選資產

日期：2026-08-14  
狀態：已套用（2026-08-15 球咖改名工程；見 `docs/superpowers/specs/2026-08-14-qiuka-rebrand-design.md`）

## 視覺規格

- 網球訊號黃綠：`#ddf53c`
- 深墨綠：`#12291c`
- 暖白：`#faf9f3`
- 純平面色，禁止漸層、陰影、發光與立體效果。
- 外框、接縫與表情採圓端。
- 家族規則：微笑與輪廓不變，球面紋理隨球種替換；兩道接縫是網球版規格。
- 建議最小彩色使用尺寸為 24px；16px 僅作 favicon 相容性測試。
- 安全空間至少為圖形寬度的 8%。

## 原始向量

- `qiuka-smile-mark.svg`：透明背景彩色主標。
- `qiuka-smile-mark-mono.svg`：背景無關的單色線條版，可用 CSS `color` 改色。
- `qiuka-app-icon.svg`：暖白實底、無預先圓角的 App Icon 主檔。

## PNG 輸出

`png/app-icon/` 包含 16、24、32、48、64、120、180、192、512、1024px 的不透明 App Icon；`png/mark/` 包含透明背景彩色與單色預覽；`png/wordmark/` 包含「球咖」字標與微笑球橫式 lockup（Noto Sans TC 700 渲染的透明背景 PNG，供 OG 卡與貼文使用；向量字標待後續由設計工具產出）。

## 驗證結果

- 三份 SVG 均通過 XML 語法檢查。
- SVG 只使用 `#ddf53c`、`#12291c`、`#faf9f3`，沒有漸層、陰影、濾鏡、透明效果或外部資源。
- App Icon PNG 的 alpha 最小值與最大值皆為 100%，沒有透明像素。
- 彩色與單色 mark PNG 保留透明背景。
- 24、32、48px 可清楚讀出微笑與網球接縫；16px 只作相容性輸出。
- 專案既有公開品牌色與對比測試共 6 項全數通過。

檢視圖位於 `review/qiuka-production-candidate-board.png` 與 `review/qiuka-small-size-test.png`。

## 套用狀態

2026-08-15 球咖改名工程已把本資產套用至產品：`public/icon.svg`（內容置換、檔名不變）、
`public/apple-touch-icon.png`（180px）、`public/icon-192.png`／`public/icon-512.png`
（manifest icons 含 maskable）與 `public/og.png`（1200×630 社群分享卡）。
`qiuka-smile-mark-mono.svg` 的 fill 已改為 `currentColor`，可用 CSS `color` 改色。
