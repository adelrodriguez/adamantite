interface JSON {
  /**
   * Converts a JavaScript Object Notation (JSON) string into an object.
   *
   * @param text A valid JSON string.
   * @param reviver A function that transforms the results. This function is called for each member
   *   of the object. If a member contains nested objects, the nested objects are transformed before
   *   the parent object is.
   */
  parse(text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown): unknown
  // A reviver that annotates `this` or `value` does not match the overload above. This overload
  // takes it, so the call does not fall through to the library overload that returns `any`.
  parse(text: string, reviver: (this: never, key: string, value: never) => unknown): unknown
}
