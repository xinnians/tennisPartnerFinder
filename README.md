# Tennis Partner Finder｜台北網球球伴地圖(原型)

以「球場」為單位的網球球伴地圖:地圖上每支圖釘都釘在台北市真實球場的座標,
分成兩種釘 —

- **球友釘**(綠色實心・主要):公開位置的註冊球友。點開顯示暱稱、NTRP、
  想打類型、固定時段、LINE ID,以及「送出邀請」按鈕(原型階段只跳 alert)。
- **需求釘**(奶油底虛線框・次要):某球場附近有人徵球伴。點開顯示區域、程度
  (例「約3.5」或「程度未提供」)、需求原句與「查看原貼文」連結,
  不顯示姓名或聯絡方式。

上方篩選列可依 **NTRP 範圍** 與 **想打類型(單打/雙打/對拉)** 即時過濾圖釘。

> 純前端原型:HTML + JavaScript(Vite),沒有後端、沒有資料庫,
> 資料全部寫死在 `src/mockData.js`。

## 快速開始

```bash
npm install     # 安裝依賴(只有 Vite)
npm run dev     # 啟動本機開發伺服器,預設 http://localhost:5173
```

### 填入 Google Maps API key(必要)

打開 **`src/config.js`**,把 `"___"` 換成你的 key:

```js
export const GOOGLE_MAPS_API_KEY = "___"; // ← 換成你的 API key
```

存檔後 Vite 會自動重新載入。**沒填 key 時頁面不會壞**,會顯示一個說明蓋板
(附球場與資料一覽),篩選列照常可以操作。

### 取得 Google Maps API key

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建立(或選擇)一個專案。
2. 在「API 和服務」啟用 **Maps JavaScript API**。
3. 到「憑證」建立 **API 金鑰**。
4. 建議在金鑰設定裡加上 HTTP referrer 限制(例如 `http://localhost:5173/*`)。

## 專案結構

```
index.html          頁面骨架:標題列、篩選列、地圖容器、圖例、API key 說明蓋板
src/
  config.js         ★ GOOGLE_MAPS_API_KEY 填這裡;地圖中心/縮放設定
  mockData.js       假資料:6 座台北真實球場、7 位球友、6 則徵球伴需求
  filters.js        篩選純函式(NTRP 範圍、想打類型、顯示開關)
  pins.js           兩種圖釘的 SVG 圖示(marker 與圖例共用)
  map.js            Google Maps 載入、地圖建立、圖釘與 InfoWindow 繪製
  main.js           進入點:綁 UI 事件、載入地圖、套篩選重畫
  style.css         全部樣式;開頭的 design tokens 是換膚入口
```

## 假資料形狀

`src/mockData.js` 匯出兩個陣列:

```ts
// 球友釘
RegisteredPlayer: {
  id, displayName, ntrp: number, goals: string[],   // 單打/雙打/對拉
  homeCourt: string, courtLat, courtLng,            // 釘在球場,不是住家
  availability: string[], lineId
}

// 需求釘
DemandPin: {
  id, court: string, courtLat, courtLng,
  ntrp: number | null,        // null = 程度未提供
  rawSkill: string | null,    // 原貼文的程度描述,如「約3.5」「中上」
  demandText: string, sourceUrl
}
```

球場清單(名稱/行政區/大約座標)在同檔案的 `COURTS`,
新增資料時座標請從這裡拿,維持「圖釘=球場」的原則。

## 篩選規則

- **NTRP 範圍**:同時作用於球友釘與需求釘。
- **含程度未提供**:`ntrp: null` 的需求釘是否顯示(預設顯示)。
- **想打類型**:只作用於球友釘 —— 需求釘沒有結構化的類型欄位
  (原句在 `demandText` 裡),所以不受此篩選影響。
- **顯示開關**:可個別隱藏球友釘/需求釘。

## 關於設計檔

原設計 `Tennis Partner Finder.dc.html` 存在 claude.ai/design 專案中,但這個
遠端環境無法完成 `/design-login` 互動授權,所以目前的視覺是依產品描述重建的
基準(球場綠/紅土橘/網球黃綠)。之後拿到設計檔時,對照調整
`src/style.css` 開頭的 design tokens(顏色、圓角、陰影、字體)即可全站換膚,
版面結構不用動。
