import * as RpcServer from "@shared/rpc"
import * as WorkerRpc from "@shared/worker-1-rpc"
import * as Worker2Rpc from "@shared/worker-2-rpc"
import { DurableObject } from "cloudflare:workers"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import * as LogLevel from "effect/LogLevel"
import * as Stream from "effect/Stream"

export const WorkerRpcLive = WorkerRpc.WorkerRpcs.toLayer(
  Effect.gen(function*() {
    const worker2Rpc = yield* Worker2Rpc.WorkerRpcClient
    return {
      echo: Effect.fn(
        function*() {
          const client = yield* worker2Rpc.useClient
          const message = yield* client.echo()

          return message + ` - [worker-1-${Date.now()}]`
        }
      ),
      date: () =>
        Effect.gen(function*() {
          const client = yield* worker2Rpc.useClient

          return pipe(client.date(), Stream.take(10))
        }).pipe(Stream.unwrap)
    }
  })
).pipe(
  Layer.provide(Worker2Rpc.WorkerRpcClient.Live)
)

export class TestDurableObject extends DurableObject<Env> {
  private rpcServer: ReturnType<ReturnType<typeof RpcServer["make"]>>

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)

    if (!(globalThis as any).env) {
      Object.assign(globalThis, {
        env,
        waitUntil: ctx.waitUntil.bind(ctx)
      })
    }

    this.ctx.setHibernatableWebSocketEventTimeout(5000)

    const Live = Layer.mergeAll(
      WorkerRpcLive,
      WorkerRpc.SerializationLive
    ).pipe(
      Layer.provide(Logger.pretty),
      Layer.provide(Logger.minimumLogLevel(LogLevel.All))
    )

    const makeRpcServer = RpcServer.make(WorkerRpc.WorkerRpcs, Live, {
      onWrite: (data) => {
        this.broadcast(data)
      }
    })

    this.rpcServer = makeRpcServer({ concurrency: "unbounded" })

    this.ctx.blockConcurrencyWhile(async () => {
      await this.rpcServer.init()
    })
  }

  private broadcast(msg: any) {
    this.ctx.getWebSockets().forEach((ws) => {
      ws.send(msg)
    })
  }

  async fetch(_request: Request): Promise<Response> {
    const webSocketPair = new WebSocketPair()
    const [websocketClient, websocketServer] = Object.values(webSocketPair)

    this.ctx.acceptWebSocket(websocketServer)

    return new Response(null, {
      status: 101,
      webSocket: websocketClient
    })
  }

  async webSocketMessage(_ws: WebSocket, message: ArrayBuffer): Promise<void> {
    const data = message instanceof Uint8Array ? message : new Uint8Array(message)

    await this.rpcServer.send(data).catch((e) => console.error("ws rpc handle error", e))
  }

  webSocketError(_ws: WebSocket, error: unknown): void | Promise<void> {
    console.error("ws error", error)
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close()
    } catch {
      // ignore
    }

    await this.rpcServer.dispose().catch((_) => console.error("ws close error", _))
  }
}

declare global {
  // eslint-disable-next-line no-var
  var env: Env
}

export default {
  fetch(request, env, ctx) {
    if (!(globalThis as any).env) {
      Object.assign(globalThis, {
        env,
        waitUntil: ctx.waitUntil.bind(ctx)
      })
    }

    const testDurableObjectId = "first"

    const durableObjectId = env.TestDurableObject.idFromName(testDurableObjectId)
    const stub = env.TestDurableObject.get(durableObjectId)

    return stub.fetch(request)
  }
} satisfies ExportedHandler<Env>
