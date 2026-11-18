type Diet = "vegan" | "omnivore"

export const labels: { readonly [Key in Diet]: string } = { omnivore: "O", vegan: "V" }
