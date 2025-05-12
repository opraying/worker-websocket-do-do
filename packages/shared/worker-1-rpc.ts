import * as Socket from "@effect/platform/Socket"
import * as Rpc from "@effect/rpc/Rpc"
import * as RpcClient from "@effect/rpc/RpcClient"
import * as RpcGroup from "@effect/rpc/RpcGroup"
import * as RpcSerialization from "@effect/rpc/RpcSerialization"
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

const makeClientLayer = (path: string = "/") =>
  RpcClient.layerProtocolSocket({ retryTransientErrors: true }).pipe(
    Layer.provide([
      SerializationLive,
      Socket.layerWebSocket("http://localhost:8787" + path).pipe(
        Layer.provide(
          Socket.layerWebSocketConstructorGlobal
        )
      )
    ])
  )

// [TODO]
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type TempClient = RpcClient.RpcClient<Rpc.Rpc<"hi", Schema.Struct<{}>>>

export class WorkerRpcClient extends Context.Tag("WorkerRpcClient")<WorkerRpcClient, TempClient>() {
  static Default = Layer.unwrapScoped(Effect.gen(function*() {
    const client = yield* RpcClient.make(UsersRpcs)

    return Layer.succeed(WorkerRpcClient, client as TempClient)
  })).pipe(
    Layer.provide(
      makeClientLayer("/")
    )
  )
}
