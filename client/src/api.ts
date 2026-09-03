import axios from "axios";

const TOKEN_KEY = "zapizapi_token";

const api = axios.create({
  baseURL: "/api",
  timeout: 300000,
});

// Adiciona o token em todas as requisições
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Se receber 401, limpa o token e manda para o login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export const TOKEN_STORAGE_KEY = TOKEN_KEY;
export default api;
