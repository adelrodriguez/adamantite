declare const owner: { property: string }
export const value = Reflect['get'](owner, 'property')
