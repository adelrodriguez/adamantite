import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import Counter from "../modules/test-counter.vue"

describe("Counter", () => {
  it("increments when clicked", async () => {
    expect.hasAssertions()
    const wrapper = mount(Counter, { props: { initial: 0 } })
    expect(wrapper.text()).toContain("0")
    await wrapper.get("button").trigger("click")
    expect(wrapper.text()).toContain("1")
  })
})
