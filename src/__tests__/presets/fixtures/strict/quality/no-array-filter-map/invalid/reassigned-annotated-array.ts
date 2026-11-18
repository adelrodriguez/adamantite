declare function load(): number[]

let values: number[] = []
values = load()

export const doubled = values.filter((value) => value > 0).map((value) => value * 2)
