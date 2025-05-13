import { WorkerRpcClient } from "@shared/worker-1-rpc"
import * as Effect from "effect/Effect"
import * as Logger from "effect/Logger"
import * as LogLevel from "effect/LogLevel"
import * as Schedule from "effect/Schedule"

const program = Effect.gen(function*() {
  const client = yield* WorkerRpcClient.useClient
  yield* Effect.logTrace("HI")

  yield* client.hi().pipe(
    Effect.tap((_) => Effect.log("call hi", _)),
    Effect.repeat({
      schedule: Schedule.spaced(500)
    })
  )

  yield* Effect.never
}).pipe(
  Effect.provide(WorkerRpcClient.Live),
  Effect.scoped,
  Logger.withMinimumLogLevel(LogLevel.All),
  Effect.catchAllCause(Effect.logError),
  Effect.catchAllDefect(Effect.logError),
  Effect.orDie
)

Effect.runPromise(program)
