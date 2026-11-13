"use server"

declare function save(name: string): void

export async function rename(name: string) {
  save(name)
}
