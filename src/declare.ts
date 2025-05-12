import * as HttpApiEndpoint from "@effect/platform/HttpApiEndpoint"
import * as HttpApiGroup from "@effect/platform/HttpApiGroup"
import * as OpenApi from "@effect/platform/OpenApi"
import * as Schema from "effect/Schema"
import { UserWithSensitive } from "./model"

export class AppApi extends HttpApiGroup.make("app")
  .add(
    HttpApiEndpoint.get("index", "/").addSuccess(
      UserWithSensitive
    )
  )
  .add(HttpApiEndpoint.get("health", "/health").addSuccess(Schema.String))
  .annotateContext(OpenApi.annotations({
    title: "App Api",
    description: "App Api"
  }))
{}
