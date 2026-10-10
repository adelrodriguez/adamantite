declare module "*?raw" {
  // Vite imports a file as a string with the `?raw` query. Tests use it to read repository files
  // without touching the host filesystem at run time.
  const content: string
  export default content
}
