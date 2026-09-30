import { useReducer } from "react"

interface State {
  count: number
}

function reducer(state: State) {
  state.count += 1
  return state
}

export function Counter() {
  const [state, dispatch] = useReducer(reducer, { count: 0 })
  return (
    <button onClick={() => dispatch()} type="button">
      {state.count}
    </button>
  )
}
