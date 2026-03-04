import {LockOutlined, UserOutlined} from '@ant-design/icons';
import {LoginForm, ProFormText} from '@ant-design/pro-components';
import {history, useModel} from '@umijs/max';
import {login} from '@/services/auth';
import {App} from 'antd';


export default function Login() {
  // 引入全局状态，用于登录后更新用户信息
  const {message} = App.useApp();  // 用这个替代静态导入的 message
  const {setInitialState} = useModel('@@initialState');

  const handleSubmit = async (values: any) => {
    try {
      // 1. 调用登录 API
      const res = await login({
        username: values.username,
        password: values.password,
      });

      // 你的后端返回 { code: 0, data: { access_token, refresh_token, user }, message: "ok" }
      // app.tsx 的拦截器已经帮我们把 data 解包出来了，所以这里的 res 直接就是内部的数据
      const {access_token, refresh_token, user} = res;

      message.success('登录成功！');

      // 2. 将 Token 和用户信息存入 LocalStorage
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      localStorage.setItem('user', JSON.stringify(user));

      // 3. 更新全局状态 (这会触发 access.ts 重新计算权限菜单)
      await setInitialState((s) => ({...s, currentUser: user}));

      // 4. 根据角色动态跳转到对应工作台
      const roleMap: Record<string, string> = {
        sales: '/sales/mine',
        researcher: '/researcher/tasks',
        admin: '/admin/dashboard',
      };

      const targetPath = roleMap[user.role] || '/';
      history.push(targetPath);

    } catch (error: any) {
      // 优先从后端响应中取错误信息
      const msg =
        error?.info?.message ||
        error?.response?.data?.message ||
        error?.data?.message ||
        error?.message ||
        '登录失败，请检查用户名和密码';
      message.error(msg);
    }
  };

  return (
    <div style={{backgroundColor: '#f0f2f5', height: '100vh', paddingTop: '12vh'}}>
      <LoginForm
        title="需求管理系统"
        subTitle="内部业务流转平台"
        onFinish={handleSubmit}
      >
        <ProFormText
          name="username"
          fieldProps={{
            size: 'large',
            prefix: <UserOutlined/>,
          }}
          placeholder="请输入用户名 (测试用如: admin, sales1)"
          rules={[
            {
              required: true,
              message: '用户名是必填项！',
            },
          ]}
        />
        <ProFormText.Password
          name="password"
          fieldProps={{
            size: 'large',
            prefix: <LockOutlined/>,
          }}
          placeholder="请输入密码"
          rules={[
            {
              required: true,
              message: '密码是必填项！',
            },
          ]}
        />
      </LoginForm>
    </div>
  );
}
