type Shape = { readonly _tag: "Circle" } | { readonly _tag: "Square" }

export function corners(shape: Shape) {
  switch (shape._tag) {
    case "Circle":
      return 0
    case "Square":
      return 4
  }
}
