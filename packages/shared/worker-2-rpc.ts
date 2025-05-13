import * as Rpc from "@effect/rpc/Rpc"
import * as RpcClient from "@effect/rpc/RpcClient"
import * as RpcGroup from "@effect/rpc/RpcGroup"
import * as RpcSerialization from "@effect/rpc/RpcSerialization"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { makeRpcClient } from "./rpc-client"

export const SerializationLive = RpcSerialization.layerMsgPack

export class WorkerRpcs extends RpcGroup.make(
  Rpc.make("echo", {
    success: Schema.String
  }),
  Rpc.make("date", {
    success: Schema.DateTimeUtc,
    stream: true
  })
) {
  static make = RpcClient.make(WorkerRpcs)
}

export class WorkerRpcClient extends makeRpcClient("WorkerRpcClient", WorkerRpcs.make) {
  static Live = this.WebsocketFromFetcher(() => globalThis.env.Worker2, "/sync").pipe(
    Layer.provide(SerializationLive)
  )
}
