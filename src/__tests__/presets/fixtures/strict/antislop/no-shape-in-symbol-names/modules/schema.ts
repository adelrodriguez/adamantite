export interface ExternalSchema {
  readonly shape: { readonly id: string }
}

export const UserSchema: ExternalSchema = { shape: { id: "user" } }

export function draw(options: { readonly shape: string }): string {
  return options.shape
}
