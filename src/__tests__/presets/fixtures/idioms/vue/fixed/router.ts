import { createRouter, createWebHistory } from "vue-router"
import HomeView from "../modules/home-view.vue"

export const router = createRouter({
  history: createWebHistory(),
  routes: [{ component: HomeView, name: "home", path: "/" }],
})
