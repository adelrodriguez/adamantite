type User = { readonly id: string }

declare function describe(name: string, body: () => void): void
declare function it(name: string, body: () => void): void

describe("user", () => {
  const user: User = { id: "1" }
  const widened: unknown = user

  it("reads id", () => {
    console.info((widened as User).id)
  })
})
