import { request } from '@umijs/max';

// 定义登录接口，对应后端的 POST /auth/login
export async function login(data: any) {
  return request('/api/v1/auth/login', {
    method: 'POST',
    data,
  });
}
