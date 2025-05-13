import { NodeRuntime } from "@effect/platform-node"
import { WorkerRpcClient } from "@shared/worker-1-rpc"
import * as Effect from "effect/Effect"
import * as Logger from "effect/Logger"
import * as LogLevel from "effect/LogLevel"
import * as Schedule from "effect/Schedule"
import * as Stream from "effect/Stream"

const program = Effect.gen(function*() {
  const client = yield* WorkerRpcClient.useClient

  yield* client.echo().pipe(
    Effect.tap((_) => Effect.log("echo", _)),
    Effect.repeat({
      schedule: Schedule.spaced(1000)
    }),
    Effect.fork
  )

  yield* client.date().pipe(
    Stream.tap((_) => Effect.log("date", _)),
    Stream.runDrain,
    Effect.fork
  )

  yield* Effect.never
}).pipe(
  Effect.scoped,
  Effect.provide(WorkerRpcClient.Live),
  Logger.withMinimumLogLevel(LogLevel.All),
  Effect.catchAllCause(Effect.logError),
  Effect.catchAllDefect(Effect.logError),
  Effect.orDie
)

NodeRuntime.runMain(program)
