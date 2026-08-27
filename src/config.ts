// ============================================================
//  Google Maps API key 由 Vite 環境變數提供。
//  請在 .env.local 設定 VITE_GOOGLE_MAPS_API_KEY。
//  沒填時,頁面會顯示說明蓋板而不是地圖。
// ============================================================
interface AppImportMetaEnv extends ImportMetaEnv {
  readonly VITE_AUTH_LINE_PROVIDER_ID?: string;
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string;
  readonly VITE_SUPPORT_EMAIL?: string;
  readonly VITE_WEB_PUSH_VAPID_PUBLIC_KEY?: string;
}

const env: AppImportMetaEnv = import.meta.env ?? {};

export const GOOGLE_MAPS_API_KEY: string = env.VITE_GOOGLE_MAPS_API_KEY ?? "___";
// AdvancedMarkerElement requires a Cloud Maps map ID. Empty keeps the
// production-safe legacy Marker fallback until hosted configuration is ready.
export const GOOGLE_MAPS_MAP_ID: string = env.VITE_GOOGLE_MAPS_MAP_ID ?? "";

// 首發只開放台北市;雙北目錄仍完整保留在資料庫中。
export const LAUNCH_CITY = "台北市";
export const TAIPEI_TIME_ZONE = "Asia/Taipei";
// 地圖尚未回傳第一個 viewport 前,session 查詢使用此台北市範圍作為 fallback。
export const TAIPEI_CITY_BOUNDS = { south: 24.95, west: 121.43, north: 25.18, east: 121.67 };
// Session discovery always has an explicit, bounded time window. The UI may
// provide a narrower viewport/window, but never broadens beyond this default.
export const DISCOVERY_WINDOW_DAYS = 14;
export const MAP_IDLE_DEBOUNCE_MS = 250;
export const LOCATION_INITIAL_RADIUS_METERS = 5000;
// 聊天室開啟期間的安靜輪詢間隔;探索資料在地圖前景時的背景重抓間隔。
// 皆為 best-effort 更新:MVP 無 realtime 通道,靠輪詢+visibilitychange 補即時性。
export const CHAT_POLL_INTERVAL_MS = 10000;
export const DISCOVERY_POLL_INTERVAL_MS = 60000;
// 生產環境必須設定;不可提交虛構公開聯絡信箱。
export const SUPPORT_EMAIL: string = env.VITE_SUPPORT_EMAIL ?? "";
// 僅含 VAPID 公鑰；私鑰只存在 Edge Function 的 secrets。
export const WEB_PUSH_VAPID_PUBLIC_KEY: string = env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY ?? "";
// LINE 登入的 Supabase custom provider 識別符(如 "custom:line")。留空(預設)時登入視窗
// 不顯示 LINE 按鈕;必須等對應 Supabase 專案設好同名 provider 才可設定,避免按鈕指向
// 不存在的 provider。LINE 登入只作身分驗證,聯絡面退役紅線不變。
export const AUTH_LINE_PROVIDER_ID: string = env.VITE_AUTH_LINE_PROVIDER_ID ?? "";

// 地圖初始視野:以台北市為中心,zoom 12 大約可看到整個市區
export const MAP_CENTER = { lat: 25.03, lng: 121.55 };
export const MAP_ZOOM = 12;
