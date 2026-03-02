import { defineConfig } from '@umijs/max';
import routes from './routes';
import proxy from './proxy';

export default defineConfig({
  antd: {},
  access: {},
  model: {},
  initialState: {},
  request: {},
  layout: {
    title: '需求管理系统', // 这里是你系统左上角的名字
  },
  routes,
  proxy: proxy.dev,
  locale: {
    default: 'zh-CN', // 默认语言设为中文
    antd: true,
    baseNavigator: false, // 关闭浏览器语言自动检测
  },
});
