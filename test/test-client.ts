import { WorkerRpcClient } from "@shared/worker-1-rpc"
import { Schedule } from "effect"
import * as Effect from "effect/Effect"
import * as Logger from "effect/Logger"
import * as LogLevel from "effect/LogLevel"

const program = Effect.gen(function*() {
  const client = yield* WorkerRpcClient
  yield* Effect.logTrace("HI")

  yield* client.hi({}).pipe(
    Effect.tap((_) => Effect.log("call hi", _)),
    Effect.repeat({
      schedule: Schedule.spaced(1000)
    })
  )

  yield* Effect.never
}).pipe(
  Effect.provide(WorkerRpcClient.Default),
  Effect.scoped,
  Logger.withMinimumLogLevel(LogLevel.All),
  Effect.catchAllCause(Effect.logError),
  Effect.catchAllDefect(Effect.logError),
  Effect.orDie
)

Effect.runPromise(program)
