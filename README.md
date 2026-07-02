# Tennis Partner Finder｜找球伴(原型)

以「球場」為單位的台北網球球伴地圖。視覺與版面對照 claude.ai/design 匯出的
設計檔 **`Tennis Partner Finder.dc.html`**(深森林綠 × 萊姆、Baloo 2 +
Noto Sans TC、底部卡片與聚合釘),地圖換成真正的 **Google Maps JavaScript API**。

地圖上的釘都釘在台北市真實球場的座標(不是住家),共三種:

- **球友釘**(萊姆圓+暱稱字首・主要):公開位置的註冊球友。點開底部卡片
  顯示暱稱、NTRP、想打類型、固定時段、LINE ID 與「送出邀請」。
- **需求釘**(白底灰虛線框「徵」・次要):某球場附近有人徵球伴。點開顯示
  區域、大概程度(如「約 3.5」/「程度未提供」)、需求原句與「查看原貼文」
  連結;不顯示姓名或聯絡方式。
- **聚合釘**(深綠圓+數量):同球場有多筆時聚合,點開球場抽屜逐筆查看。

> 純前端原型:HTML + JavaScript(Vite),沒有後端、沒有資料庫,
> 資料全部寫死在 `src/mockData.js`。邀請與個人檔案只存在記憶體。

## 快速開始

```bash
npm install     # 安裝依賴(只有 Vite)
cp .env.example .env.local
npm run dev     # 啟動本機開發伺服器,預設 http://localhost:5173
```

### 填入 Google Maps API key(必要)

打開 **`.env.local`**,把 `___` 換成你的 key:

```bash
VITE_GOOGLE_MAPS_API_KEY=___
```

存檔後 Vite 會自動重新載入。**沒填 key(或 key 無效)時頁面不會壞**,
會顯示說明蓋板與球場資料一覽。

> 注意:`.env.local` 不會進 git。Google Maps browser key 仍會在瀏覽器中可見,
> 請務必在 Google Cloud Console 加上 HTTP referrer 限制;如果 key 曾經被提交或分享,
> 建議旋轉成新 key。

### 取得 Google Maps API key

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建立(或選擇)一個專案。
2. 在「API 和服務」啟用 **Maps JavaScript API**。
3. 到「憑證」建立 **API 金鑰**。
4. 建議在金鑰設定裡加上 HTTP referrer 限制(例如 `http://localhost:5173/*`)。

## 專案結構

```
index.html          三個分頁的骨架:地圖(浮層+chips)、我的邀請、個人檔案、tab bar
.env.example        本機環境變數範本;複製成 .env.local 後填入 Maps key
src/
  config.js         讀取 VITE_GOOGLE_MAPS_API_KEY;地圖中心/縮放設定
  mockData.js       假資料:6 座台北真實球場、6 位球友、6 則徵球伴需求
  filters.js        篩選純函式(NTRP band、想打類型)
  pins.js           三種圖釘的 SVG(球友/需求/聚合,樣式取自設計檔)
  map.js            Maps 載入、鼠尾草色系地圖樣式、依球場分組與畫釘
  sheets.js         底部卡片(球友/需求)、球場抽屜、邀請 modal
  main.js           進入點:分頁、篩選接線、邀請清單、個人檔案表單
  util.js           esc / URL 白名單 / 來源標籤 / NTRP 分級文案
  style.css         全部樣式;開頭 design tokens 取自設計檔
```

## 假資料形狀

`src/mockData.js` 匯出兩個陣列:

```ts
// 球友釘
RegisteredPlayer: {
  id, displayName, ntrp: number, goals: string[],   // 單打/對拉/雙打/練球
  homeCourt: string, courtLat, courtLng,            // 釘在球場,不是住家
  availability: string[], lineId
}

// 需求釘
DemandPin: {
  id, court: string, courtLat, courtLng,
  ntrp: number | null,        // null = 沒有可換算的數字程度
  rawSkill: string | null,    // 原貼文的程度描述,如「約 3.5」「中上」
  demandText: string, sourceUrl
}
```

卡片上的「大概程度」顯示 `rawSkill`;`rawSkill` 也是 `null` 才顯示「程度未提供」。
球場清單(名稱/行政區/大約座標)在同檔案的 `COURTS`,新增資料時座標請從
這裡拿,維持「圖釘=球場」的原則;同球場多筆會自動變聚合釘。

## 篩選規則(沿用設計檔行為)

- **程度**:下拉選 NTRP 區間 —— 全部 / ≤ 3.0 / 3.0–4.0 / 4.0–5.0 / 5.0+。
  同時作用於球友釘與需求釘;`ntrp: null` 的需求釘一律通過(不因沒數字被濾掉)。
- **想打類型**(單打/對拉/雙打/練球):chips 可複選,**未選任何 chip = 不限**。
  只作用於球友釘 —— 需求釘沒有結構化的類型欄位(原句在 `demandText`),不受影響。
- 篩選變更即時重畫圖釘;聚合數量也會跟著變(例如選 4.0–5.0 時,
  台北網球中心的聚合釘會攤開成 Leo 的個別球友釘)。

## 與設計檔的差異(刻意取捨)

- 設計檔是 390×844 手機殼展示;原型改成滿版 RWD —— 地圖吃滿視窗,
  卡片/彈窗/tab bar 在桌機上限寬 430px 置中,手機上就是原設計的樣子。
- 設計檔的假地圖(SVG 街區)換成真 Google Maps,配色用地圖樣式
  重現設計的鼠尾草色系(陸地 #ECEDE7 / 水域 #C4D8E2 / 公園 #D8E6C4)。
- 「送出邀請」做了設計檔的完整 modal 流程(選時段 → 留言 → 成功畫面),
  送出後寫進「我的邀請」分頁(僅記憶體);沒有真的通知任何人。
- 設計檔的「完整檔案」第二層頁面未實作 —— 底部卡片已涵蓋原型需要的
  全部欄位;之後要加再說。
