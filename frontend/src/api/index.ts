/* API 封装 */
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "http://localhost:8000",
  // 本地 Ollama 9B 模型响应慢（实测 17–31s），30s 会误超时；提到 120s
  timeout: 120000,
});

// 请求拦截器：注入 Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：401 跳登录
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);

export default api;

// ---- Auth ----
export const authAPI = {
  login: (student_id: string, password: string) =>
    api.post("/api/auth/login", { student_id, password }),
  register: (data: { student_id: string; username: string; password: string }) =>
    api.post("/api/auth/register", data),
  me: () => api.get("/api/auth/me"),
  updateProfile: (data: { college?: string; major?: string; grade?: string }) =>
    api.put("/api/auth/me", data),
};

// ---- Notifications ----
export const notificationAPI = {
  list: (params?: { category?: string; search?: string; page?: number }) =>
    api.get("/api/notifications", { params }),
  create: (data: { title: string; content: string; category?: string; source?: string; source_url?: string }) =>
    api.post("/api/notifications", data),
  categories: () => api.get("/api/notifications/categories"),
  markRead: (id: number) => api.put(`/api/notifications/${id}/read`),
  /** 教务处官网首页实时抓取（不落库，前端展示后用户点击跳官网） */
  live: () => api.get("/api/notifications/live"),
};

// ---- Courses ----
export const courseAPI = {
  list: () => api.get("/api/courses"),
  today: () => api.get("/api/courses/today"),
  /** 某周课表：不传 week 默认当前周 */
  week: (week?: number) =>
    api.get("/api/courses/week", { params: week ? { week } : undefined }),
  create: (data: any) => api.post("/api/courses", data),
  delete: (id: number) => api.delete(`/api/courses/${id}`),
  /** 从教务系统导入课表：不传 student_id 时用登录用户自己的学号 */
  import: (data: { student_id?: string } = {}) =>
    api.post("/api/courses/import", data),
};

// ---- Todos ----
export const todoAPI = {
  list: (status?: string) => api.get("/api/todos", { params: { status } }),
  upcoming: (days?: number) => api.get("/api/todos/upcoming", { params: { days } }),
  create: (data: any) => api.post("/api/todos", data),
  update: (id: number, data: any) => api.put(`/api/todos/${id}`, data),
  delete: (id: number) => api.delete(`/api/todos/${id}`),
};

// ---- Chat ----
export const chatAPI = {
  send: (message: string) => api.post("/api/chat", { message }),
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post("/api/chat/upload", form);
  },
};

// ---- Assignments ----
export const assignmentAPI = {
  list: (source?: string) =>
    api.get("/api/assignments", { params: source ? { source } : undefined }),
  refresh: (data: {
    smartestu_id?: string
    smartestu_password?: string
    chaoxing_username?: string
    chaoxing_password?: string
  }) => api.post("/api/assignments/refresh", data),
  refreshLms: () => api.post("/api/assignments/lms/refresh"),
  clear: () => api.post("/api/assignments/clear"),
  delete: (id: number) => api.delete(`/api/assignments/${id}`),
};

// ---- Unified tasks ----
export const taskAPI = {
  list: (params?: { status?: string; source?: string; source_type?: string }) =>
    api.get('/api/tasks', { params }),
  create: (data: any) => api.post('/api/tasks', data),
  update: (id: number, data: any) => api.put(`/api/tasks/${id}`, data),
  complete: (id: number) => api.post(`/api/tasks/${id}/complete`),
  delete: (id: number) => api.delete(`/api/tasks/${id}`),
};

// ---- Study plans ----
export const planAPI = {
  preview: (data: any = {}) => api.post('/api/plans/preview', data),
  create: (data: any) => api.post('/api/plans', data),
  list: () => api.get('/api/plans'),
  detail: (id: number) => api.get(`/api/plans/${id}`),
  confirm: (id: number) => api.post(`/api/plans/${id}/confirm`),
  cancel: (id: number) => api.post(`/api/plans/${id}/cancel`),
};
