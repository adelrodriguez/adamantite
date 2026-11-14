<script setup lang="ts">
const { names } = defineProps<{ names: string[] }>()
</script>

<template>
  <ul>
    <li v-for="name in names" :key="name">{{ name }}</li>
  </ul>
</template>
