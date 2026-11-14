<script setup lang="ts">
const { label } = defineProps<{ label: string }>()
const emit = defineEmits<{ select: [] }>()
</script>

<template>
  <button @click="emit('select')">{{ label }}</button>
</template>
