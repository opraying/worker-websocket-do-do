import * as Etag from "@effect/platform/Etag"
import * as FileSystem from "@effect/platform/FileSystem"
import * as HttpApiBuilder from "@effect/platform/HttpApiBuilder"
import * as HttpPlatform from "@effect/platform/HttpPlatform"
import * as Path from "@effect/platform/Path"
import { pipe } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import { MyHttpApi } from "./api"
import { HttpAppLive } from "./handle"

declare global {
  // eslint-disable-next-line no-var
  var env: Env
}

const HttpLive = HttpApiBuilder.api(MyHttpApi).pipe(
  Layer.provide([HttpAppLive])
)

const Live = pipe(
  HttpApiBuilder.Router.Live,
  Layer.provideMerge(HttpLive),
  Layer.provideMerge(HttpPlatform.layer),
  Layer.provideMerge(Etag.layerWeak),
  Layer.provideMerge(Path.layer),
  Layer.provideMerge(FileSystem.layerNoop({})),
  Layer.provide(Logger.pretty)
)

export default {
  fetch(request: Request, env: Env) {
    Object.assign(globalThis, {
      env
    })

    const handler = HttpApiBuilder.toWebHandler(Live)

    return handler.handler(request as unknown as Request)
  }
}
