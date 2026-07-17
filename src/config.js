// ============================================================
//  Google Maps API key 由 Vite 環境變數提供。
//  請在 .env.local 設定 VITE_GOOGLE_MAPS_API_KEY。
//  沒填時,頁面會顯示說明蓋板而不是地圖。
// ============================================================
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "___";

// 首發只開放台北市;雙北目錄仍完整保留在資料庫中。
export const LAUNCH_CITY = "台北市";
// 地圖尚未回傳第一個 viewport 前,session 查詢使用此台北市範圍作為 fallback。
export const TAIPEI_CITY_BOUNDS = { south: 24.95, west: 121.43, north: 25.18, east: 121.67 };
export const DISCOVERY_WINDOW_DAYS = 14;
export const MAP_IDLE_DEBOUNCE_MS = 250;
export const LOCATION_INITIAL_RADIUS_METERS = 5000;
// 生產環境必須設定;不可提交虛構公開聯絡信箱。
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL ?? "";

// 地圖初始視野:以台北市為中心,zoom 12 大約可看到整個市區
export const MAP_CENTER = { lat: 25.03, lng: 121.55 };
export const MAP_ZOOM = 12;
