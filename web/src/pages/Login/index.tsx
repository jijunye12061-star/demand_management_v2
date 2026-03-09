import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { LoginForm, ProFormText } from '@ant-design/pro-components';
import { history, useModel } from '@umijs/max';
import { login } from '@/services/auth';
import { App } from 'antd';

export default function Login() {
  const { message } = App.useApp();
  const { setInitialState } = useModel('@@initialState');

  const handleSubmit = async (values: any) => {
    try {
      const res = await login({
        username: values.username,
        password: values.password,
      });

      const { access_token, refresh_token, user } = res;
      message.success('登录成功！');

      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      localStorage.setItem('user', JSON.stringify(user));

      await setInitialState((s) => ({ ...s, currentUser: user }));

      const roleMap: Record<string, string> = {
        sales: '/sales/mine',
        researcher: '/researcher/tasks',
        admin: '/admin/dashboard',
      };

      const targetPath = roleMap[user.role] || '/';
      history.push(targetPath);
    } catch (error: any) {
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'auto',
        // 使用 Ant Design 官方推荐的质感背景图，或者换成你们自己的渐变色
        backgroundImage: "url('https://mdn.alipayobjects.com/yuyan_qk0oxh/afts/img/V-_oS6r-i7AEAAAAAAAAAAAAFl94AQBr')",
        backgroundSize: '100% 100%',
        backgroundPosition: 'center',
      }}
    >
      <div
        style={{
          flex: '1',
          padding: '32px 0',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center', // 完美垂直居中
        }}
      >
        <LoginForm
          contentStyle={{
            minWidth: 280,
            maxWidth: '75vw',
            // 可以在这里给登录框加个轻微的阴影和白底，让它从背景中浮出来
            backgroundColor: '#ffffff',
            padding: '32px 24px',
            borderRadius: '12px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
          }}
          // 加上系统的 Logo，替换为你本地的图片路径 (例如 import logo from '@/assets/logo.png')
          logo="https://gw.alipayobjects.com/zos/rmsportal/KDpgvguMpGfqaHPjicRK.svg"
          title="研究服务管理系统"
          subTitle="专业、高效的研究服务与业务流转平台"
          onFinish={handleSubmit}
        >
          <ProFormText
            name="username"
            fieldProps={{
              size: 'large',
              prefix: <UserOutlined style={{ color: 'rgba(0,0,0,0.25)' }} />,
            }}
            placeholder="请输入用户名 (如: jijunye)"
            rules={[
              {
                required: true,
                message: '请输入用户名！', // 提示语稍微去掉了感叹号的突兀感
              },
            ]}
          />
          <ProFormText.Password
            name="password"
            fieldProps={{
              size: 'large',
              prefix: <LockOutlined style={{ color: 'rgba(0,0,0,0.25)' }} />,
            }}
            placeholder="请输入密码"
            rules={[
              {
                required: true,
                message: '请输入密码！',
              },
            ]}
          />
        </LoginForm>
      </div>

      {/* 页脚版权区域 */}
      <div
        style={{
          textAlign: 'center',
          margin: '24px 0',
          color: 'rgba(0,0,0,0.45)',
          fontSize: '14px'
        }}
      >
        Copyright © {new Date().getFullYear()} 研究服务平台出品
      </div>
    </div>
  );
}
