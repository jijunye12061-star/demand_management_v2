import { request } from '@umijs/max';

export async function login(data: { username: string; password: string }) {
  return request('/api/v1/auth/login', { method: 'POST', data });
}

export async function refreshToken(token: string) {
  return request('/api/v1/auth/refresh', {
    method: 'POST',
    data: { refresh_token: token },
  });
}

// P1-4 要求: 修改当前用户密码
export async function changePassword(data: { old_password: string; new_password: string }) {
  return request('/api/v1/auth/password', { method: 'PUT', data });
}
