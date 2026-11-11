declare namespace Reflect {
  function apply(
    target: Function,
    thisArgument: unknown,
    argumentsList: ArrayLike<unknown>
  ): unknown
  function construct(
    target: Function,
    argumentsList: ArrayLike<unknown>,
    newTarget?: Function
  ): unknown
}
