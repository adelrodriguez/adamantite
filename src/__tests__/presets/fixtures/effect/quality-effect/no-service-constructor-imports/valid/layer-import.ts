import * as Layer from "effect/Layer"
import { issueServiceLayer } from "../modules/issue-service"

export const layer = Layer.merge(issueServiceLayer, Layer.empty)
