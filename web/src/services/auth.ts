import { request } from '@umijs/max';

// 登录接口
export async function login(data: { username: string; password: string }) {
  return request('/api/v1/auth/login', {
    method: 'POST',
    data, // 直接按 JSON 格式发送你的 { username, password }
  });
}

// 刷新 Token 接口 (预留，后续可以在拦截器里做无感刷新)
export async function refreshToken(token: string) {
  return request('/api/v1/auth/refresh', {
    method: 'POST',
    data: { refresh_token: token },
  });
}
