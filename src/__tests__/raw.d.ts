declare module "*?raw" {
  // Vite imports a file as a string with the `?raw` query.
  const content: string
  export default content
}
