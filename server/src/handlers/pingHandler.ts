import { WebSocket } from "ws";
import { ClientPingMessage, ServerMessage } from "../../../shared/types.js";

export function handlePing(socket: WebSocket, message: ClientPingMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        type: "app_pong",
        clientTimestamp: message.timestamp,
        serverTimestamp: Date.now(),
      } satisfies ServerMessage)
    );
  }
}
