import { Option } from "effect"

export const doubled = Option.some(2).pipe(Option.map((value) => value * 2))
export const fallback = Option.none<string>().pipe(Option.getOrElse(() => "anonymous"))
