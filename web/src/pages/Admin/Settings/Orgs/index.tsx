import React, { useRef, useState } from 'react';
import { PageContainer, ProTable, ModalForm, ProFormText, ProFormSelect } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, Popconfirm, App } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { getAllOrganizations, createOrganization, updateOrganization, deleteOrganization } from '@/services/admin';

const ORG_TYPE_OPTIONS = ['银行', '券商', '保险', '理财', 'FOF', '信托', '私募', '期货', '其他']
  .map(t => ({ label: t, value: t }));

const Orgs: React.FC = () => {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [editingOrg, setEditingOrg] = useState<any>(null);

  const columns: ProColumns<any>[] = [
    { title: 'ID', dataIndex: 'id', width: 60, hideInSearch: true },
    { title: '机构名称', dataIndex: 'name' },
    {
      title: '机构类型', dataIndex: 'org_type', width: 100,
      valueType: 'select', fieldProps: { options: ORG_TYPE_OPTIONS },
    },
    {
      title: '操作', valueType: 'option', width: 150,
      render: (_, record) => [
        <a key="edit" onClick={() => { setEditingOrg(record); setFormVisible(true); }}>编辑</a>,
        <Popconfirm key="del" title="确定删除？" onConfirm={async () => {
          try { await deleteOrganization(record.id); message.success('已删除'); actionRef.current?.reload(); }
          catch { message.error('删除失败'); }
        }}>
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
          const data = await getAllOrganizations();
          let filtered = data;
          if (params.name) filtered = filtered.filter((o: any) => o.name.includes(params.name));
          if (params.org_type) filtered = filtered.filter((o: any) => o.org_type === params.org_type);
          return { data: filtered, total: filtered.length, success: true };
        }}
        toolBarRender={() => [
          <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => { setEditingOrg(null); setFormVisible(true); }}>
            新建机构
          </Button>,
        ]}
        pagination={{ pageSize: 10 }}
      />

      <ModalForm
        title={editingOrg ? '编辑机构' : '新建机构'}
        open={formVisible}
        onOpenChange={(vis) => { if (!vis) setEditingOrg(null); setFormVisible(vis); }}
        initialValues={editingOrg || {}}
        modalProps={{ destroyOnClose: true }}
        onFinish={async (values) => {
          try {
            if (editingOrg) {
              await updateOrganization(editingOrg.id, values);
            } else {
              await createOrganization(values as { name: string; org_type: string });
            }
            message.success(editingOrg ? '更新成功' : '创建成功');
            actionRef.current?.reload();
            return true;
          } catch (e: any) {
            message.error(e?.message || '操作失败');
            return false;
          }
        }}
      >
        <ProFormText name="name" label="机构名称" rules={[{ required: true }]} />
        <ProFormSelect name="org_type" label="机构类型" options={ORG_TYPE_OPTIONS} rules={[{ required: true }]} />
      </ModalForm>
    </PageContainer>
  );
};

export default Orgs;
