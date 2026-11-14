import { defineAsyncComponent } from "vue"

export const AsyncPanel = defineAsyncComponent(() => import("../modules/home-view.vue"))
