declare module "openai" {
  const OpenAI: any;
  export default OpenAI;
}

declare module "ws" {
  export type WebSocket = any;
  export const WebSocket: any;
  export type WebSocketServer = any;
  export const WebSocketServer: any;
}
