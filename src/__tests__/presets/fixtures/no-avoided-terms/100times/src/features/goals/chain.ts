import { Alert } from "react-native"

export const settings = { mode: "dark" }

export function describeChain(days: number) {
  Alert.alert(`Chain of ${days} days`)
}
