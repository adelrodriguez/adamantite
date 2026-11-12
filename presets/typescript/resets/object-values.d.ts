// The library's typed overloads come first, because TypeScript places this block's overloads
// before the library's. Without them, the `{}` overloads would also take records and arrays.
interface ObjectConstructor {
  values<T>(o: { [s: string]: T } | ArrayLike<T>): T[]
  values(o: {}): unknown[]
  entries<T>(o: { [s: string]: T } | ArrayLike<T>): Array<[string, T]>
  entries(o: {}): Array<[string, unknown]>
}
