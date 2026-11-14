"use server"

export default async function revalidate() {
  globalThis.dispatchEvent(new Event("revalidate"))
}
