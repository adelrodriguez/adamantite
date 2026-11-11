// The library's typed overloads come first, because TypeScript places this block's overloads
// before the library's. Without them, the variadic overload would also take typed calls.
interface ObjectConstructor {
  assign<T extends {}, U>(target: T, source: U): T & U
  assign<T extends {}, U, V>(target: T, source1: U, source2: V): T & U & V
  assign<T extends {}, U, V, W>(target: T, source1: U, source2: V, source3: W): T & U & V & W
  assign(target: object, ...sources: unknown[]): unknown
}
