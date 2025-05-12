import * as Socket from "@effect/platform/Socket"
import * as Rpc from "@effect/rpc/Rpc"
import * as RpcClient from "@effect/rpc/RpcClient"
import * as RpcGroup from "@effect/rpc/RpcGroup"
import * as RpcSerialization from "@effect/rpc/RpcSerialization"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

export const SerializationLive = RpcSerialization.layerMsgPack

export class UsersRpcs extends RpcGroup.make(
  Rpc.make("hi", {
    success: Schema.String
  })
) {}

type Fetcher = {
  fetch: typeof globalThis.fetch
}

const makeClientLayer = (fetcher: Fetcher, path: string = "/") =>
  RpcClient.layerProtocolSocket().pipe(
    Layer.provide([
      SerializationLive,
      Layer.effect(
        Socket.Socket,
        Socket.fromWebSocket(
          Effect.acquireRelease(
            Effect.gen(function*() {
              const res = yield* Effect.promise(
                () =>
                  fetcher.fetch("http://localhost" + path, {
                    headers: {
                      "Upgrade": "websocket"
                    }
                  })
              )

              // [TODO] Effect.filterOrDie

              const { webSocket } = res as unknown as Response & {
                webSocket: WebSocket & { accept: () => void } | null
              }

              if (!webSocket) {
                return yield* Effect.dieMessage("connect fetcher failure")
              }

              webSocket.accept()

              return webSocket as WebSocket
            }),
            (ws) => Effect.sync(() => ws.close())
          )
        )
      )
    ])
  )

export class RpcFetcher extends Context.Tag("RpcFetcher")<RpcFetcher, Fetcher>() {}

const RpcPath = Config.string("RPC_PATH").pipe(
  Config.orElse(() => Config.succeed("/"))
)

// [TODO]
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type TempClient = RpcClient.RpcClient<Rpc.Rpc<"hi", Schema.Struct<{}>>>

export class WorkerRpcClient extends Context.Tag("WorkerRpcClient")<WorkerRpcClient, TempClient>() {
  static Default = Layer.unwrapEffect(Effect.gen(function*() {
    const client = yield* RpcClient.make(UsersRpcs)

    return Layer.succeed(WorkerRpcClient, client)
  })).pipe(
    Layer.provide(
      Layer.unwrapEffect(
        Effect.gen(function*() {
          const fetcher = yield* RpcFetcher
          const _path = yield* RpcPath.pipe(Effect.orDie)

          return makeClientLayer(fetcher, "/sync")
        })
      )
    )
  )
}
