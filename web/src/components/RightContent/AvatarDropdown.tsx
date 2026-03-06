import { LogoutOutlined, LockOutlined } from '@ant-design/icons';
import { history, useModel } from '@umijs/max';
import { Spin, App, Form, Input } from 'antd';
import { createStyles } from 'antd-style';
import type { MenuInfo } from 'rc-menu/lib/interface';
import React, { useCallback } from 'react';
import HeaderDropdown from '../HeaderDropdown';
import { changePassword } from '@/services/auth';

const useStyles = createStyles(({ token }) => ({
  action: {
    display: 'flex',
    height: '48px',
    marginLeft: 'auto',
    overflow: 'hidden',
    alignItems: 'center',
    padding: '0 8px',
    cursor: 'pointer',
    borderRadius: token.borderRadius,
    '&:hover': { backgroundColor: token.colorBgTextHover },
  },
}));

export const AvatarName = () => {
  const { initialState } = useModel('@@initialState');
  const { currentUser } = initialState || {};
  return <span className="anticon">{currentUser?.display_name || currentUser?.username}</span>;
};

export const AvatarDropdown: React.FC<React.PropsWithChildren<any>> = ({ children }) => {
  const { styles } = useStyles();
  const { initialState, setInitialState } = useModel('@@initialState');
  const { modal, message } = App.useApp();

  const handleChangePwd = useCallback(() => {
    const formRef = { old_password: '', new_password: '', confirm: '' };
    const PwdForm = () => {
      const [form] = Form.useForm();
      // 挂到外部让 onOk 能取值
      (handleChangePwd as any).__form = form;
      return (
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="old_password" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="new_password" label="新密码" rules={[{ required: true, min: 6, message: '新密码至少6位' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认新密码"
            dependencies={['new_password']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  return !value || getFieldValue('new_password') === value
                    ? Promise.resolve()
                    : Promise.reject('两次密码不一致');
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      );
    };

    modal.confirm({
      title: '修改密码',
      icon: <LockOutlined />,
      content: <PwdForm />,
      onOk: async () => {
        const form = (handleChangePwd as any).__form;
        const values = await form.validateFields();
        await changePassword({ old_password: values.old_password, new_password: values.new_password });
        message.success('密码已修改，请重新登录');
        // 修改后强制重新登录
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        setInitialState((s: any) => ({ ...s, currentUser: undefined }));
        history.replace('/login');
      },
    });
  }, [modal, message, setInitialState]);

  const onMenuClick = useCallback(
    (event: MenuInfo) => {
      if (event.key === 'logout') {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        setInitialState((s: any) => ({ ...s, currentUser: undefined }));
        history.replace('/login');
      } else if (event.key === 'changePwd') {
        handleChangePwd();
      }
    },
    [setInitialState, handleChangePwd],
  );

  const loading = (
    <span className={styles.action}>
      <Spin size="small" style={{ marginLeft: 8, marginRight: 8 }} />
    </span>
  );

  if (!initialState) return loading;
  const { currentUser } = initialState;
  if (!currentUser?.username) return loading;

  const menuItems = [
    { key: 'changePwd', icon: <LockOutlined />, label: '修改密码' },
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录' },
  ];

  return (
    <HeaderDropdown menu={{ selectedKeys: [], onClick: onMenuClick, items: menuItems }}>
      {children}
    </HeaderDropdown>
  );
};
