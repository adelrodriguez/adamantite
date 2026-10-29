export async function detect() {
  const { detectPackageManager } = await import("nypm")

  return detectPackageManager(".")
}
