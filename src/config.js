// ============================================================
//  Google Maps API key 由 Vite 環境變數提供。
//  請在 .env.local 設定 VITE_GOOGLE_MAPS_API_KEY。
//  沒填時,頁面會顯示說明蓋板而不是地圖。
// ============================================================
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "___";

// 地圖初始視野:以台北市為中心,zoom 12 大約可看到整個市區
export const MAP_CENTER = { lat: 25.03, lng: 121.55 };
export const MAP_ZOOM = 12;
