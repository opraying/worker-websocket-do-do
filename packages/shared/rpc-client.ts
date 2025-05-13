import * as Socket from "@effect/platform/Socket"
import type * as Rpc from "@effect/rpc/Rpc"
import * as RpcClient from "@effect/rpc/RpcClient"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Layer from "effect/Layer"
import * as RcRef from "effect/RcRef"
import * as Scope from "effect/Scope"

type Fetcher = {
  fetch: typeof globalThis.fetch
}

export class RpcFetcher extends Context.Tag("RpcFetcher")<RpcFetcher, Fetcher>() {}

export const makeRpcClient = <A extends Rpc.Any>(tag: string, make: ReturnType<typeof RpcClient.make<A>>) =>
  class WorkerRpcClient extends Context.Tag(tag)<WorkerRpcClient, {
    useClient: Effect.Effect<RpcClient.RpcClient<A, never>, never, never>
  }>() {
    static useClient = Effect.flatMap(WorkerRpcClient, (_) => _.useClient)

    static Websocket = (
      url: string,
      options?: {
        readonly closeCodeIsError?: (code: number) => boolean
        readonly openTimeout?: Duration.DurationInput
        readonly protocols?: string | Array<string>
      } | undefined
    ) =>
      Layer.scoped(
        WorkerRpcClient,
        Effect.gen(function*() {
          const scope = yield* Effect.scope

          const use = pipe(
            make,
            Effect.provide(
              pipe(
                RpcClient.layerProtocolSocket({ retryTransientErrors: true }),
                Layer.provide(
                  Socket.layerWebSocket(url, options).pipe(
                    Layer.provide(Socket.layerWebSocketConstructorGlobal)
                  )
                ),
                Layer.extendScope,
                Layer.provide(Layer.succeed(Scope.Scope, scope))
              )
            ),
            Effect.provideService(Scope.Scope, scope)
          )

          const ref = yield* RcRef.make({ acquire: use, idleTimeToLive: Duration.seconds(2) })

          const useClient = Scope.fork(scope, scope.strategy).pipe(Effect.flatMap((scope) => Scope.use(ref.get, scope)))

          return { useClient }
        })
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
      Layer.scoped(
        WorkerRpcClient,
        Effect.gen(function*() {
          const scope = yield* Effect.scope

          const use = pipe(
            make,
            Effect.provide(
              pipe(
                RpcClient.layerProtocolSocket({ retryTransientErrors: true }),
                Layer.provide(Layer.effect(
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
                )),
                Layer.extendScope,
                Layer.provide(Layer.succeed(Scope.Scope, scope))
              )
            ),
            Effect.provideService(Scope.Scope, scope)
          )

          const ref = yield* RcRef.make({ acquire: use, idleTimeToLive: Duration.seconds(2) })

          const useClient = Scope.fork(scope, scope.strategy).pipe(Effect.flatMap((scope) => Scope.use(ref.get, scope)))

          return { useClient }
        })
      )
  }
