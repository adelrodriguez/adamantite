import { useMutation } from "@tanstack/react-query"
import { Alert } from "react-native"
import { attempt } from "tryharder"

export const goals = { attempt, confirm: Alert.alert, useMutation }
