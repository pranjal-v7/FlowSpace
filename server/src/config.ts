export const PORT = Number(process.env.PORT) || 4000;
export const MAX_USERS_PER_ROOM = 8;
export const MAX_OBJECTS_PER_ROOM = 750;
// Render 512MB RAM ceiling allocation: 500 active rooms consumes ~100-150MB, safely leaving 350MB+ for Node.js runtime
export const MAX_ACTIVE_ROOMS = Number(process.env.MAX_ACTIVE_ROOMS) || 500;
export const EMPTY_ROOM_COOLDOWN_MS = 60 * 1000; // 60 seconds empty room grace cooldown
export const SESSION_RECONNECT_WINDOW_MS = 30 * 1000; // 30 seconds reconnect grace window
export const WS_HEARTBEAT_INTERVAL_MS = 5000;
export const WS_HEARTBEAT_TIMEOUT_MS = 12000;
export const MAX_CURSOR_RATE_PER_SEC = 35;
export const MAX_REACTIONS_PER_SEC = 5;
export const MAX_ACTIONS_PER_SEC = 60;
export const MAX_BACKPRESSURE_BYTES = 64 * 1024; // 64KB threshold for dropping droppable cursor packets
