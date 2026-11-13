import * as Schema from "effect/Schema"

/**
 * Decodes the plain JSON that Adamantite writes. A test that reads a written file expects plain
 * JSON, so text with comments or trailing commas fails the test.
 */
export const decodeJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Json))
