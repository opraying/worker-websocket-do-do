import { DurableObject } from "cloudflare:workers"

export class TestDurableObject extends DurableObject<Env> {
  private worker2WS: WebSocket | null = null

  private broadcast(msg: any) {
    this.ctx.getWebSockets().forEach((ws) => {
      ws.send(msg)
    })
  }

  async fetch(_request: Request): Promise<Response> {
    const webSocketPair = new WebSocketPair()
    const [websocketClient, websocketServer] = Object.values(webSocketPair)

    const worker2Response = await this.env.Worker2.fetch(
      new Request("http://localhost/sync", {
        headers: {
          "Upgrade": "websocket"
        }
      })
    )
    const worker2Ws = worker2Response.webSocket

    if (!worker2Ws) {
      throw new Error("Failed to establish WebSocket connection with Worker2")
    }
    worker2Ws.accept()
    this.worker2WS = worker2Ws

    this.worker2WS.addEventListener("message", (event) => {
      const message = event.data
      this.broadcast("received worker2 message: " + message)
    })

    this.ctx.acceptWebSocket(websocketServer)

    return new Response(null, {
      status: 101,
      webSocket: websocketClient
    })
  }

  webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): void | Promise<void> {
    this.broadcast("received worker1 message: " + message)
    this.worker2WS?.send(message)
  }

  webSocketError(_ws: WebSocket, error: unknown): void | Promise<void> {
    console.log("ws error", error)
  }

  webSocketClose(): void | Promise<void> {
    console.log("ws close")
    this.worker2WS = null
  }
}

declare global {
  // eslint-disable-next-line no-var
  var env: Env
}

export default {
  fetch(request, env) {
    Object.assign(globalThis, {
      env
    })

    const testDurableObjectId = "first"

    const durableObjectId = env.TestDurableObject.idFromName(testDurableObjectId)
    const stub = env.TestDurableObject.get(durableObjectId)

    return stub.fetch(request)
  }
} satisfies ExportedHandler<Env>
