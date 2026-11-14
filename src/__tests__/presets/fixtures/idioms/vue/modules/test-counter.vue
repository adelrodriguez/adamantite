<script setup lang="ts">
import { ref } from "vue"

const { initial } = defineProps<{ initial: number }>()
const count = ref(initial)
</script>
<template><button @click="count++">{{ count }}</button></template>
