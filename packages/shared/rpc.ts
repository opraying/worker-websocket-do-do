import * as HttpServerRequest from "@effect/platform/HttpServerRequest"
import * as Socket from "@effect/platform/Socket"
import type * as Rpc from "@effect/rpc/Rpc"
import type * as RpcGroup from "@effect/rpc/RpcGroup"
import type * as RpcSerialization from "@effect/rpc/RpcSerialization"
import * as RpcServer from "@effect/rpc/RpcServer"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as FiberSet from "effect/FiberSet"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Scope from "effect/Scope"

const layerWebsocketHttpApp = <Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options?:
    | {
      readonly disableTracing?: boolean | undefined
      readonly spanPrefix?: string | undefined
      readonly concurrency?: number | "unbounded" | undefined
    }
    | undefined
) =>
  Layer.scopedDiscard(
    Effect.gen(function*() {
      const { httpApp, protocol } = yield* RpcServer.makeProtocolWithHttpAppWebsocket

      yield* RpcServer.make(group, options).pipe(Effect.provideService(RpcServer.Protocol, protocol), Effect.forkScoped)

      const socket = yield* Socket.Socket
      const dummyRequest = HttpServerRequest.HttpServerRequest.of(
        {
          upgrade: Effect.sync(() => socket)
        } satisfies Partial<HttpServerRequest.HttpServerRequest> as unknown as HttpServerRequest.HttpServerRequest
      )

      // Simulate an HttpServerRequest
      // Trigger onSocket to set the socket, upgrade returns a Socket.Socket
      // websocket on message -> Socket -> write -> write to ws client

      yield* httpApp.pipe(
        Effect.provideService(HttpServerRequest.HttpServerRequest, dummyRequest),
        Effect.forkScoped
      )
    })
  )

export const make = <Rpcs extends Rpc.Any, LA = never>(
  group: RpcGroup.RpcGroup<Rpcs>,
  layer: Layer.Layer<RpcSerialization.RpcSerialization | Rpc.ToHandler<Rpcs> | LA, never, never>,
  _: {
    onWrite: (_: Uint8Array) => void
  }
) => {
  return (
    options?:
      | {
        readonly disableTracing?: boolean | undefined
        readonly spanPrefix?: string | undefined
        readonly concurrency?: number | "unbounded" | undefined
      }
      | undefined
  ) => {
    let initialized = false
    const memo = Effect.runSync(Layer.makeMemoMap)
    const emitter = new EventEmitter()

    const Full: Layer.Layer<Socket.Socket, never, never> = layerWebsocketHttpApp(group, options).pipe(
      Layer.provide(layer),
      Layer.provide(Layer.effectDiscard(Effect.sync(() => emitter.on("response", (data) => _.onWrite(data))))),
      Layer.provideMerge(Layer.effect(Socket.Socket, fromEvents(Effect.succeed(emitter)))),
      Layer.provide(Layer.scope)
    )

    let runtime = ManagedRuntime.make(Full, memo)

    const init = async () => {
      await runtime.runtime()
      initialized = true
    }

    const send = async (_: Uint8Array) => {
      if (!initialized) {
        await init()
      }
      emitter.emit("request", _)
    }

    const dispose = async () => {
      // emitter.emit("done", {})
      initialized = false

      try {
        await runtime.dispose()
      } catch {
        // ignore
      }

      runtime = ManagedRuntime.make(Full, memo)
    }

    return { init, send, dispose }
  }
}

class EventEmitter {
  private listeners: Map<string, Set<(message: any) => void>> = new Map()

  on(event: string, listener: (message: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)?.add(listener)
  }

  emit(event: string, message: any) {
    const listeners = this.listeners.get(event)
    if (listeners) {
      listeners.forEach((listener) => listener(message))
    }
  }

  off(event: string, listener: (message: any) => void) {
    const listeners = this.listeners.get(event)
    if (listeners) {
      listeners.delete(listener)
      if (listeners.size === 0) {
        this.listeners.delete(event)
      }
    }
  }

  clear() {
    this.listeners.clear()
  }
}

const fromEvents = <R>(acquire: Effect.Effect<EventEmitter, Socket.SocketError, R>, options?: {
  readonly closeCodeIsError?: (code: number) => boolean
}): Effect.Effect<Socket.Socket, never, Exclude<R, Scope.Scope>> =>
  Effect.withFiberRuntime((fiber) => {
    const latch = Effect.unsafeMakeLatch(false)
    let currentStream: {
      readonly stream: EventEmitter
      readonly fiberSet: FiberSet.FiberSet<any, any>
    } | undefined
    const acquireContext = fiber.currentContext as Context.Context<R>
    const closeCodeIsError = options?.closeCodeIsError ?? Socket.defaultCloseCodeIsError

    const runRaw = <_, E, R>(handler: (_: string | Uint8Array) => Effect.Effect<_, E, R> | void) =>
      Effect.scopedWith((scope) =>
        Effect.gen(function*() {
          const stream = yield* Scope.extend(acquire, scope)
          yield* Scope.addFinalizer(scope, Effect.sync(() => stream.clear()))
          const fiberSet = yield* FiberSet.make<any, E | Socket.SocketError>().pipe(Scope.extend(scope))
          const runFork = yield* FiberSet.runtime(fiberSet)<R>()

          yield* Effect.async<void, Socket.SocketCloseError>(
            (callback) => {
              stream.on("request", (value: Uint8Array) => {
                const result = handler(value)
                if (Effect.isEffect(result)) {
                  runFork(result)
                }
              })

              stream.on("done", (code: number, closeReason?: string | undefined) => {
                callback(
                  Effect.fail(
                    new Socket.SocketCloseError({ reason: "Close", code: code ?? 1000, closeReason })
                  )
                )
              })
            }
          ).pipe(
            Effect.mapError(
              (cause) => Socket.isSocketError(cause) ? cause : new Socket.SocketGenericError({ reason: "Read", cause })
            ),
            FiberSet.run(fiberSet)
          )

          currentStream = { stream, fiberSet }
          yield* latch.open

          return yield* FiberSet.join(fiberSet).pipe(
            Effect.catchIf(
              Socket.SocketCloseError.isClean((_) => !closeCodeIsError(_)),
              (_) => Effect.void
            )
          )
        })
      ).pipe(
        Effect.mapInputContext((input: Context.Context<R>) => Context.merge(acquireContext, input)),
        Effect.ensuring(Effect.sync(() => {
          latch.unsafeClose()
          currentStream = undefined
        })),
        Effect.interruptible
      )

    const encoder = new TextEncoder()
    const run = <_, E, R>(handler: (_: Uint8Array) => Effect.Effect<_, E, R> | void) =>
      runRaw((data) =>
        typeof data === "string"
          ? handler(encoder.encode(data))
          : handler(data)
      )

    const write = (chunk: Uint8Array | string | Socket.CloseEvent) =>
      latch.whenOpen(Effect.suspend(() => {
        const { fiberSet, stream } = currentStream!
        if (Socket.isCloseEvent(chunk)) {
          return Deferred.fail(
            fiberSet.deferred,
            new Socket.SocketCloseError({ reason: "Close", code: chunk.code, closeReason: chunk.reason })
          )
        }
        return Effect.sync(() => stream.emit("response", typeof chunk === "string" ? encoder.encode(chunk) : chunk))
          .pipe(Effect.as(true))
      }))

    const writer = Effect.succeed(write)

    return Effect.succeed(Socket.Socket.of({
      [Socket.TypeId]: Socket.TypeId,
      run,
      runRaw,
      writer
    }))
  })
