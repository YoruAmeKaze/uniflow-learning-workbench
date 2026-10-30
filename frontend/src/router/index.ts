/* 路由配置 */
import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      component: () => import("../views/HomePage.vue"),
      meta: { title: "学习工作台" },
    },
    {
      path: "/chat",
      name: "chat",
      component: () => import("../views/ChatPage.vue"),
      meta: { title: "AI聊天" },
    },
    {
      path: "/notifications",
      name: "notifications",
      component: () => import("../views/NotificationPage.vue"),
      meta: { title: "通知" },
    },
    {
      path: "/courses",
      name: "courses",
      component: () => import("../views/CoursePage.vue"),
      meta: { title: "课表" },
    },
    {
      path: "/todos",
      name: "todos",
      component: () => import("../views/TodoPage.vue"),
      meta: { title: "待办" },
    },
    {
      path: "/tasks",
      name: "tasks",
      component: () => import("../views/TaskPage.vue"),
      meta: { title: "全部任务" },
    },
    {
      path: "/plans",
      name: "plans",
      component: () => import("../views/PlanPage.vue"),
      meta: { title: "AI 学习规划" },
    },
    {
      path: "/assignments",
      name: "assignments",
      component: () => import("../views/AssignmentPage.vue"),
      meta: { title: "作业" },
    },
    {
      path: "/profile",
      name: "profile",
      component: () => import("../views/ProfilePage.vue"),
      meta: { title: "个人中心" },
    },
    {
      path: "/login",
      name: "login",
      component: () => import("../views/LoginPage.vue"),
      meta: { title: "登录" },
    },
  ],
});

// 路由守卫：未登录跳登录页
router.beforeEach((to) => {
  const token = localStorage.getItem("token");
  if (to.name !== "login" && !token) {
    return { name: "login" };
  }
});

export default router;
