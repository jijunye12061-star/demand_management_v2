import React, { useRef, useState } from 'react';
import { PageContainer, ProTable, ModalForm, ProFormText, ProFormSelect } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, Popconfirm, Tag, Input, App } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { getUsers, createUser, updateUser, deleteUser, resetPassword, getTeams } from '@/services/admin';

const ROLE_MAP: Record<string, { text: string; color: string }> = {
  admin: { text: '管理员', color: 'red' },
  sales: { text: '销售', color: 'blue' },
  researcher: { text: '研究员', color: 'green' },
};

const Users: React.FC = () => {
  const { message, modal } = App.useApp();
  const actionRef = useRef<ActionType>(null);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [formVisible, setFormVisible] = useState(false);

  const handleResetPwd = (record: any) => {
    let pwd = '';
    modal.confirm({
      title: `重置 ${record.display_name} 的密码`,
      content: <Input.Password placeholder="请输入新密码" onChange={(e) => { pwd = e.target.value; }} />,
      onOk: async () => {
        if (!pwd) { message.warning('请输入新密码'); throw new Error('empty'); }
        await resetPassword(record.id, pwd);
        message.success('密码已重置');
      },
    });
  };

  const columns: ProColumns<any>[] = [
    { title: 'ID', dataIndex: 'id', width: 60, hideInSearch: true },
    { title: '用户名', dataIndex: 'username' },
    { title: '显示名', dataIndex: 'display_name', hideInSearch: true },
    {
      title: '角色', dataIndex: 'role', width: 90,
      valueType: 'select',
      valueEnum: { admin: { text: '管理员' }, sales: { text: '销售' }, researcher: { text: '研究员' } },
      render: (_, r) => { const cfg = ROLE_MAP[r.role]; return <Tag color={cfg?.color}>{cfg?.text || r.role}</Tag>; },
    },
    {
      title: '所属团队', dataIndex: 'team_name', width: 120, hideInSearch: true,
      render: (v: any) => v || <span style={{ color: '#999' }}>未分配</span>,
    },
    {
      title: '操作', valueType: 'option', width: 200,
      render: (_, record) => [
        <a key="edit" onClick={() => { setEditingUser(record); setFormVisible(true); }}>编辑</a>,
        <a key="pwd" onClick={() => handleResetPwd(record)}>重置密码</a>,
        <Popconfirm key="del" title="确定删除？" onConfirm={async () => { await deleteUser(record.id); message.success('已删除'); actionRef.current?.reload(); }}>
          <a style={{ color: '#ff4d4f' }}>删除</a>
        </Popconfirm>,
      ],
    },
  ];

  return (
    <PageContainer>
      <ProTable
        actionRef={actionRef}
        columns={columns}
        rowKey="id"
        request={async (params) => {
          const data = await getUsers(params.role);
          let filtered = data;
          if (params.username) filtered = filtered.filter((u: any) => u.username.includes(params.username));
          return { data: filtered, total: filtered.length, success: true };
        }}
        toolBarRender={() => [
          <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => { setEditingUser(null); setFormVisible(true); }}>
            新建用户
          </Button>,
        ]}
        pagination={{ pageSize: 10 }}
      />

      <ModalForm
        title={editingUser ? '编辑用户' : '新建用户'}
        open={formVisible}
        onOpenChange={(vis) => { if (!vis) setEditingUser(null); setFormVisible(vis); }}
        initialValues={editingUser || { role: 'sales' }}
        modalProps={{ destroyOnClose: true }}
        onFinish={async (values) => {
          try {
            if (editingUser) {
              await updateUser(editingUser.id, { display_name: values.display_name, role: values.role, team_id: values.team_id || null });
            } else {
              await createUser(values as { username: string; password: string; role: string; display_name: string; team_id?: number });
            }
            message.success(editingUser ? '更新成功' : '创建成功');
            actionRef.current?.reload();
            return true;
          } catch (e: any) {
            message.error(e?.message || '操作失败');
            return false;
          }
        }}
      >
        <ProFormText name="username" label="用户名" rules={[{ required: true }]} disabled={!!editingUser} />
        {!editingUser && <ProFormText.Password name="password" label="密码" rules={[{ required: true }]} />}
        <ProFormText name="display_name" label="显示名" rules={[{ required: true }]} />
        <ProFormSelect name="role" label="角色" rules={[{ required: true }]}
          options={[{ label: '管理员', value: 'admin' }, { label: '销售', value: 'sales' }, { label: '研究员', value: 'researcher' }]}
        />
        <ProFormSelect name="team_id" label="所属团队"
          request={async () => { const teams = await getTeams(); return teams.map((t: any) => ({ label: t.name, value: t.id })); }}
        />
      </ModalForm>
    </PageContainer>
  );
};

export default Users;
