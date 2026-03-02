import type { RequestConfig, RunTimeLayoutConfig } from '@umijs/max';
import { history } from '@umijs/max';
import { message } from 'antd';

const loginPath = '/login';

// 1. 前台登记处：系统启动时，检查本地有没有存过用户信息
export async function getInitialState(): Promise<{ currentUser?: any }> {
  const userStr = localStorage.getItem('user_info');
  if (userStr) {
    try {
      // 如果本地有存用户信息，就读取出来
      return { currentUser: JSON.parse(userStr) };
    } catch (error) {
      localStorage.removeItem('user_info');
    }
  }
  // 如果没登录，且当前不在登录页，就强制踢回登录页
  if (history.location.pathname !== loginPath) {
    history.push(loginPath);
  }
  return {};
}

// 2. 页面布局配置：控制整个系统外框的样子
export const layout: RunTimeLayoutConfig = ({ initialState }) => {
  return {
    // 右上角显示用户昵称（如果有的话）
    rightContentRender: () => <div>{initialState?.currentUser?.display_name || '未登录'}</div>,

    // 每次切换页面时触发（巡逻保安）
    onPageChange: () => {
      const { location } = history;
      // 如果没登录，又想偷偷去别的页面，直接踢回登录页
      if (!initialState?.currentUser && location.pathname !== loginPath) {
        history.push(loginPath);
      }
    },
  };
};

// 3. 网络请求配置：统一处理 Token 和后端返回的格式（专属快递员）
export const request: RequestConfig = {
  timeout: 10000,

  // 发送请求前：自动把 Token 塞进请求头里（Header）
  requestInterceptors: [
    (config: any) => {
      const token = localStorage.getItem('access_token');
      // 如果有 token，就按照后端要求的格式 Bearer <token> 放进去
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
  ],

  // 收到响应后：自动拆快递盒
  responseInterceptors: [
    (response: any) => {
      const { data } = response;
      // 我们的后端统一返回 { code, data, message }
      if (data && typeof data.code !== 'undefined') {
        if (data.code === 0) {
          // 如果 code 是 0 (成功)，把里面真正的 data 提取出来，扔掉外面的包装
          response.data = data.data;
        } else {
          // 如果 code 不是 0，说明业务报错了（比如密码错误），直接弹出红色提示框
          message.error(data.message || '请求出错了');
          return Promise.reject(new Error(data.message));
        }
      }
      return response;
    },
  ],

  // 发生严重网络错误时（比如 401 未登录或 Token 过期）
  errorConfig: {
    errorHandler: (error: any) => {
      if (error?.response?.status === 401) {
        // 清理掉过期的本地信息
        localStorage.removeItem('access_token');
        localStorage.removeItem('user_info');
        message.error('登录已过期或未授权，请重新登录');
        // 踢回登录页
        history.push(loginPath);
      }
    },
  },
};
