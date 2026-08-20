// Production-only replacement for mockData.js. Keep every exported collection present so dataApi.js
// retains one stable import contract, but never ship fictional sessions, players, courts, or previews.
export const COURTS = Object.freeze([]);
export const MOCK_PLAYERS = Object.freeze([]);
export const MOCK_PLAYER_PRESENCE = Object.freeze([]);
export const MOCK_SESSION_JOIN_PREVIEWS = Object.freeze([]);
export const MOCK_SESSIONS = Object.freeze([]);
