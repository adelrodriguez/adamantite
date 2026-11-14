"use client"

import { useInput } from "./use-input.js"

export function ControlledForm() {
  const [inputValue, setInputValue] = useInput()

  return (
    <form>
      <label htmlFor="title">Title</label>
      <input
        id="title"
        value={inputValue}
        onChange={(event) => {
          setInputValue(event.target.value)
        }}
      />
      <button type="submit">Add</button>
    </form>
  )
}
