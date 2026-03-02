import { history, type RequestConfig, type RunTimeLayoutConfig } from '@umijs/max';
import { AvatarDropdown, AvatarName } from './components/RightContent/AvatarDropdown';
import { message } from 'antd';

const loginPath = '/login';

// 1. 获取全局初始状态 (从 localStorage 读取)
export async function getInitialState(): Promise<{
  currentUser?: { id: number; username: string; role: string; display_name: string };
}> {
  const token = localStorage.getItem('access_token');
  const userStr = localStorage.getItem('user');

  if (token && userStr) {
    try {
      return { currentUser: JSON.parse(userStr) };
    } catch (e) {
      console.error('解析用户信息失败', e);
    }
  }

  // 如果没有 Token 且不在登录页，强制跳转
  const { location } = history;
  if (location.pathname !== loginPath) {
    history.push(loginPath);
  }
  return {};
}

// 2. ProLayout 布局配置
export const layout: RunTimeLayoutConfig = ({ initialState }) => {
  return {
    avatarProps: {
      src: 'https://gw.alipayobjects.com/zos/antfincdn/XAosXuNZyF/BiazfanxmamNRoxxVxka.png',
      title: <AvatarName />,
      render: (_, avatarChildren) => {
        return <AvatarDropdown>{avatarChildren}</AvatarDropdown>;
      },
    },
    disableContentMargin: false,
    waterMarkProps: {
      content: initialState?.currentUser?.display_name,
    },
    onPageChange: () => {
      const { location } = history;
      // 路由发生变化时检查 token
      if (!localStorage.getItem('access_token') && location.pathname !== loginPath) {
        history.push(loginPath);
      }
    },
    menuHeaderRender: undefined,
  };
};

// 3. 全局请求拦截与响应处理
export const request: RequestConfig = {
  timeout: 10000,
  requestInterceptors: [
    (config: any) => {
      const token = localStorage.getItem('access_token');
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
  ],
  responseInterceptors: [
    (response: any) => {
      const { data } = response;
      // 拦截 { code, data, message } 格式 (针对 HTTP 200 的业务错误)
      if (data && typeof data.code !== 'undefined') {
        if (data.code !== 0) {
          // 这里抛出错误，会流转到下面的 errorHandler
          const error: any = new Error(data.message || '业务请求失败');
          error.info = data; // 挂载原始数据供后续判断
          throw error;
        }
        // 解包成功的数据
        response.data = data.data;
      }
      return response;
    },
  ],
  errorConfig: {
    errorHandler: (error: any) => {
      console.log('errorHandler:', error, error?.response);
      const { response, info, message: errorMsg } = error;

      // 1. 如果是后端返回了 HTTP 错误状态码 (如 400, 401, 500)
      if (response) {
        const backendMessage = response.data?.message || '请求发生错误';

        if (response.status === 401) {
          // 如果已经在登录页，直接提示密码错误，不执行跳转逻辑
          if (history.location.pathname === loginPath) {
            message.error(backendMessage);
            return;
          }
          // 如果在其他页面 401，说明 Token 过期
          message.warning('登录已过期，请重新登录');
          localStorage.clear();
          history.push(loginPath);
        } else {
          // 比如 400 (常见的登录错误校验) 或 500
          message.error(backendMessage);
        }
      }
      // 2. 如果是我们在 responseInterceptors 主动抛出的业务错误
      else if (info) {
        message.error(errorMsg);
      }
      // 3. 其他网络崩溃等严重错误
      else {
        message.error(errorMsg || '网络或服务器异常，请重试');
      }
    },
  },
};
