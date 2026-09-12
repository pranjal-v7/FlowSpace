import { WebSocket } from "ws";
import { SessionRateLimiters } from "./rateLimiter.js";
import { RemoteCursorSnapshot } from "../../shared/types.js";
import crypto from "crypto";

export type SessionState = "active" | "reconnecting" | "left";

export interface UserSession {
  userId: string;
  resumeToken: string;
  sessionVersion: number;
  displayName: string;
  color: string;
  roomId: string;
  socket: WebSocket;
  connected: boolean;
  state: SessionState;
  joinedAt: number;
  lastSeenAt: number;
  lastCursor: RemoteCursorSnapshot | null;
  rateLimiters: SessionRateLimiters;
  isAlive: boolean;
  markActive(): void;
  markReconnecting(): void;
  markLeft(): void;
  canResume(): boolean;
}

export function createSession(
  socket: WebSocket,
  roomId: string,
  displayName: string,
  color: string,
  existingUserId?: string,
  existingResumeToken?: string
): UserSession {
  const userId = existingUserId || `u_${crypto.randomBytes(4).toString("hex")}`;
  const resumeToken = existingResumeToken || crypto.randomBytes(24).toString("base64url");
  const now = Date.now();

  const session: UserSession = {
    userId,
    resumeToken,
    sessionVersion: 1,
    displayName,
    color,
    roomId,
    socket,
    connected: true,
    state: "active",
    joinedAt: now,
    lastSeenAt: now,
    lastCursor: null,
    rateLimiters: new SessionRateLimiters(),
    isAlive: true,
    markActive() {
      this.state = "active";
      this.connected = true;
    },
    markReconnecting() {
      this.state = "reconnecting";
      this.connected = false;
    },
    markLeft() {
      this.state = "left";
      this.connected = false;
    },
    canResume() {
      return this.state === "reconnecting";
    },
  };

  return session;
}

