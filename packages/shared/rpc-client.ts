import * as Socket from "@effect/platform/Socket"
import type * as Rpc from "@effect/rpc/Rpc"
import * as RpcClient from "@effect/rpc/RpcClient"
import * as Context from "effect/Context"
import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Layer from "effect/Layer"

type Fetcher = {
  fetch: typeof globalThis.fetch
}

export class RpcFetcher extends Context.Tag("RpcFetcher")<RpcFetcher, Fetcher>() {}

export const makeRpcClient = <A extends Rpc.Any>(tag: string, make: ReturnType<typeof RpcClient.make<A>>) =>
  class WorkerRpcClient extends Effect.Service<WorkerRpcClient>()(tag, {
    accessors: true,
    effect: Effect.gen(function*() {
      const ctx = yield* Effect.context<RpcClient.Protocol>()
      // const scope = yield* Effect.scope

      const useClient = pipe(
        make,
        Effect.provide(ctx),
        Effect.scoped
      )

      return { useClient }
    })
  }) {
    static Websocket = (
      url: string,
      options?: {
        readonly closeCodeIsError?: (code: number) => boolean
        readonly openTimeout?: Duration.DurationInput
        readonly protocols?: string | Array<string>
      } | undefined
    ) =>
      pipe(
        this.Default,
        Layer.provide(RpcClient.layerProtocolSocket({ retryTransientErrors: true })),
        Layer.provide(
          Socket.layerWebSocket(url, options).pipe(
            Layer.provide(Socket.layerWebSocketConstructorGlobal)
          )
        )
      )

    static WebsocketFromFetcher = (
      fetcher: () => Fetcher,
      pathname: string,
      options?: {
        readonly closeCodeIsError?: (code: number) => boolean
        readonly openTimeout?: Duration.DurationInput
        readonly protocols?: string | Array<string>
      } | undefined
    ) =>
      pipe(
        this.Default,
        Layer.provide(RpcClient.layerProtocolSocket()),
        Layer.provide(
          Layer.effect(
            Socket.Socket,
            Socket.fromWebSocket(
              Effect.acquireRelease(
                pipe(
                  Effect.promise(() =>
                    fetcher().fetch(`http://localhost${pathname}`, { headers: { "Upgrade": "websocket" } })
                  ),
                  Effect.flatMap((_) => {
                    const { webSocket } = _ as unknown as Response & {
                      webSocket: WebSocket & { accept: () => void } | null
                    }

                    if (!webSocket) {
                      return Effect.dieMessage("connect fetcher failure")
                    }

                    webSocket.accept()

                    return Effect.succeed(webSocket)
                  })
                ),
                (ws) => Effect.sync(() => ws.close(1000))
              ),
              options
            )
          )
        )
      )
  }
