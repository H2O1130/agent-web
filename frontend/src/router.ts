import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import Home from './views/Home.vue'

const routes: RouteRecordRaw[] = [
  { path: '/', component: Home },
  { path: '/plan', component: () => import('./views/Wizard.vue') },
  { path: '/analysis', component: () => import('./views/Analysis.vue') },
  { path: '/roadmap', component: () => import('./views/Roadmap.vue') },
  { path: '/adjust', component: () => import('./views/Adjust.vue') },
  { path: '/history', component: () => import('./views/History.vue') },
  { path: '/:pathMatch(.*)*', component: () => import('./views/NotFound.vue') },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})
