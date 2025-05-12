import { DurableObject } from "cloudflare:workers"

export class TestDurableObject extends DurableObject<Env> {
  fetch(_request: Request): Response | Promise<Response> {
    const webSocketPair = new WebSocketPair()
    const [websocketClient, websocketServer] = Object.values(webSocketPair)

    this.ctx.acceptWebSocket(websocketServer)

    return new Response(null, {
      status: 101,
      webSocket: websocketClient
    })
  }

  webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): void | Promise<void> {
    this.ctx.getWebSockets().forEach((ws) => {
      ws.send(message)
    })
  }

  webSocketError(_ws: WebSocket, error: unknown): void | Promise<void> {
    console.log("ws error", error)
  }

  webSocketClose(): void | Promise<void> {
    console.log("ws close")
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

    const url = new URL(request.url)
    const { pathname } = url

    if (pathname !== "/sync") return new Response("404", { status: 404 })

    const testDurableObjectId = "first"

    const durableObjectId = env.TestDurableObject.idFromName(testDurableObjectId)
    const stub = env.TestDurableObject.get(durableObjectId)

    return stub.fetch(request)
  }
} satisfies ExportedHandler<Env>
