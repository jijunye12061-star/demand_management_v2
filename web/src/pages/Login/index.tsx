import { LoginForm, ProFormText } from '@ant-design/pro-components';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { message } from 'antd';
import { history } from '@umijs/max';
import { login } from '@/services/auth'; // 引入我们刚才写的接口

export default function Login() {
  // 点击登录按钮后执行的动作
  const handleLogin = async (values: any) => {
    try {
      // 发送请求给后端
      const res = await login(values);
      // 如果后端返回了 access_token，说明密码对了
      if (res && res.access_token) {
        // 把 token 存到浏览器本地，当作“通行证”
        localStorage.setItem('access_token', res.access_token);
        localStorage.setItem('refresh_token', res.refresh_token);
        // 弹出绿色成功的提示
        message.success('登录成功！');
        // 暂时先让它跳转回根目录
        history.push('/');
      }
    } catch (error) {
      console.error('登录失败', error);
      // 错误提示后面我们会用拦截器统一处理
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '10vh' }}>
      <LoginForm
        title="需求管理系统"
        subTitle="内部人员专属系统"
        onFinish={handleLogin}
      >
        <ProFormText
          name="username"
          fieldProps={{ size: 'large', prefix: <UserOutlined /> }}
          placeholder="请输入用户名"
          rules={[{ required: true, message: '用户名不能为空哦' }]}
        />
        <ProFormText.Password
          name="password"
          fieldProps={{ size: 'large', prefix: <LockOutlined /> }}
          placeholder="请输入密码"
          rules={[{ required: true, message: '密码不能为空哦' }]}
        />
      </LoginForm>
    </div>
  );
}
