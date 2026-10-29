// This module runs under whatever runtime executes oxlint in the target project, so it sticks to
// runtime-neutral APIs.

function escapeRegExp(text: string) {
  return text.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)
}

/**
 * Convert a glob to a regular expression that matches a whole path with forward slashes. Supports
 * `**`, `*`, `?`, `[a-z]` and `[!a-z]` character classes, and `{a,b}` alternation.
 */
export function globToRegExp(glob: string): RegExp {
  let source = ""
  let index = 0

  while (index < glob.length) {
    const rest = glob.slice(index)

    if (rest.startsWith("**/")) {
      source += "(?:.*/)?"
      index += 3
    } else if (rest === "/**") {
      source += "(?:/.*)?"
      index += 3
    } else if (rest.startsWith("**")) {
      source += ".*"
      index += 2
    } else if (rest.startsWith("*")) {
      source += "[^/]*"
      index += 1
    } else if (rest.startsWith("?")) {
      source += "[^/]"
      index += 1
    } else if (rest.startsWith("[") && rest.indexOf("]") > 1) {
      const end = rest.indexOf("]")
      const negated = rest.startsWith("[!")
      const characters = rest.slice(negated ? 2 : 1, end).replaceAll(/[\\^]/g, String.raw`\$&`)

      source += `[${negated ? "^" : ""}${characters}]`
      index += end + 1
    } else if (rest.startsWith("{") && rest.includes("}")) {
      const end = rest.indexOf("}")
      const alternatives = rest
        .slice(1, end)
        .split(",")
        .map((alternative) => escapeRegExp(alternative))

      source += `(?:${alternatives.join("|")})`
      index += end + 1
    } else {
      source += escapeRegExp(glob.charAt(index))
      index += 1
    }
  }

  return new RegExp(`^${source}$`)
}
