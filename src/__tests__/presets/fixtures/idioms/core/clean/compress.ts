import { createReadStream, createWriteStream } from "node:fs"
import { pipeline } from "node:stream/promises"
import { createGzip } from "node:zlib"

export async function compress(source: string, destination: string) {
  await pipeline(createReadStream(source), createGzip(), createWriteStream(destination))
}
