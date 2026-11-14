import { computed, ref, watch } from "vue"

export function useSearch() {
  const query = ref("")
  const normalized = computed(() => query.value.trim())
  const lastQuery = ref("")

  watch(query, (value) => {
    lastQuery.value = value
  })

  return { lastQuery, normalized, query }
}
