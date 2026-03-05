import React, { useRef, useState } from 'react';
import {
  PageContainer, ProTable, DrawerForm,
  ProFormText, ProFormTextArea, ProFormSelect, ProFormSwitch, ProFormDependency,
} from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Tag, Popconfirm, Switch, Descriptions, App } from 'antd';
import { getRequests, updateRequest, getResearchers, getSales, getOrganizations } from '@/services/api';
import { deleteRequest, toggleConfidential } from '@/services/admin';
import type { RequestItem, Organization } from '@/services/typings';
import { STATUS_ENUM, REQUEST_TYPE_OPTIONS, RESEARCH_SCOPE_OPTIONS, ORG_DEPARTMENT_MAP } from '@/utils/constants';

const Requests: React.FC = () => {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RequestItem | null>(null);
  const [orgList, setOrgList] = useState<Organization[]>([]);

  const openEdit = async (record: RequestItem) => {
    if (!orgList.length) {
      const orgs = await getOrganizations();
      setOrgList(orgs);
    }
    setEditingRecord(record);
    setDrawerVisible(true);
  };

  const columns: ProColumns<RequestItem>[] = [
    { title: 'ID', dataIndex: 'id', width: 50, hideInSearch: true },
    { title: '标题', dataIndex: 'title', ellipsis: true },
    { title: '需求描述', dataIndex: 'description', ellipsis: true, width: 200, hideInSearch: true },
    { title: '关键字', dataIndex: 'keyword', hideInTable: true },
    {
      title: '需求类型', dataIndex: 'request_type', width: 110,
      valueType: 'select', fieldProps: { options: REQUEST_TYPE_OPTIONS },
    },
    { title: '机构', dataIndex: 'org_name', ellipsis: true, width: 120, hideInSearch: true },
    {
      title: '机构类型', dataIndex: 'org_type', width: 80,
      valueType: 'select',
      fieldProps: { options: ['银行', '券商', '保险', '理财', 'FOF'].map(t => ({ label: t, value: t })) },
    },
    { title: '销售', dataIndex: 'sales_name', width: 80, hideInSearch: true },
    { title: '研究员', dataIndex: 'researcher_name', width: 80, hideInSearch: true },
    {
      title: '状态', dataIndex: 'status', width: 80,
      valueType: 'select',
      valueEnum: Object.fromEntries(Object.entries(STATUS_ENUM).map(([k, v]) => [k, { text: v.text }])),
      render: (_, r) => {
        const cfg = STATUS_ENUM[r.status];
        return <Tag color={cfg?.status?.toLowerCase()}>{cfg?.text || r.status}</Tag>;
      },
    },
    {
      title: '保密', dataIndex: 'is_confidential', width: 70, hideInSearch: true,
      render: (_, r) => (
        <Switch
          size="small"
          checked={!!r.is_confidential}
          onChange={async (checked) => {
            try {
              await toggleConfidential(r.id, checked);
              message.success('已更新');
              actionRef.current?.reload();
            } catch { message.error('操作失败'); }
          }}
        />
      ),
    },
    { title: '工时', dataIndex: 'work_hours', width: 60, hideInSearch: true },
    { title: '创建时间', dataIndex: 'created_at', valueType: 'dateTime', width: 150, hideInSearch: true },
    {
      title: '日期范围', dataIndex: 'dateRange', valueType: 'dateRange', hideInTable: true,
      search: { transform: (v) => ({ date_from: v[0], date_to: v[1] }) },
    },
    {
      title: '操作', valueType: 'option', width: 150, fixed: 'right',
      render: (_, record) => [
        <a key="edit" onClick={() => openEdit(record)}>编辑</a>,
        <Popconfirm key="del" title="确定删除？此操作不可恢复" onConfirm={async () => {
          try { await deleteRequest(record.id); message.success('已删除'); actionRef.current?.reload(); }
          catch { message.error('删除失败'); }
        }}>
          <a style={{ color: '#ff4d4f' }}>删除</a>
        </Popconfirm>,
      ],
    },
  ];

  return (
    <PageContainer>
      <ProTable<RequestItem>
        actionRef={actionRef}
        columns={columns}
        rowKey="id"
        scroll={{ x: 1600 }}
        request={async (params) => getRequests({ ...params, current: params.current, pageSize: params.pageSize })}
        pagination={{ pageSize: 15 }}
      />

      <DrawerForm
        title="编辑需求"
        open={drawerVisible}
        onOpenChange={(vis) => { if (!vis) setEditingRecord(null); setDrawerVisible(vis); }}
        initialValues={editingRecord ? { ...editingRecord, is_confidential: !!editingRecord.is_confidential } : {}}
        drawerProps={{ destroyOnClose: true, width: 600 }}
        onFinish={async (values) => {
          if (!editingRecord) return false;
          try {
            await updateRequest(editingRecord.id, values);
            message.success('更新成功');
            actionRef.current?.reload();
            return true;
          } catch (e: any) {
            message.error(e?.message || '更新失败');
            return false;
          }
        }}
      >
        {/* 只读元信息区 */}
        {editingRecord && (
          <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="需求 ID">{editingRecord.id}</Descriptions.Item>
            <Descriptions.Item label="当前状态">
              <Tag color={STATUS_ENUM[editingRecord.status]?.status?.toLowerCase()}>
                {STATUS_ENUM[editingRecord.status]?.text || editingRecord.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">{editingRecord.created_at || '-'}</Descriptions.Item>
            <Descriptions.Item label="最近更新">{editingRecord.updated_at || '-'}</Descriptions.Item>
            {editingRecord.completed_at && <Descriptions.Item label="完成时间">{editingRecord.completed_at}</Descriptions.Item>}
            {editingRecord.withdraw_reason && <Descriptions.Item label="退回原因" span={2}>{editingRecord.withdraw_reason}</Descriptions.Item>}
          </Descriptions>
        )}

        <ProFormText name="title" label="标题" rules={[{ required: true }]} />
        <ProFormTextArea name="description" label="描述" />
        <ProFormSelect name="request_type" label="需求类型" options={REQUEST_TYPE_OPTIONS} rules={[{ required: true }]} />
        <ProFormSelect name="research_scope" label="研究范围" options={RESEARCH_SCOPE_OPTIONS} />
        <ProFormSelect
          name="org_name" label="机构名称"
          options={orgList.map(o => ({ label: o.name, value: o.name }))}
          rules={[{ required: true }]}
        />
        <ProFormSelect
          name="org_type" label="机构类型"
          options={['银行', '券商', '保险', '理财', 'FOF', '信托', '私募', '期货', '其他'].map(t => ({ label: t, value: t }))}
        />
        <ProFormDependency name={['org_type']}>
          {({ org_type }) => {
            const depts = ORG_DEPARTMENT_MAP[org_type];
            if (!depts) return null;
            return <ProFormSelect name="department" label="部门" options={depts.map(d => ({ label: d, value: d }))} />;
          }}
        </ProFormDependency>
        <ProFormSelect
          name="researcher_id" label="研究员 (重新分配)"
          request={async () => { const list = await getResearchers(); return list.map(r => ({ label: r.display_name, value: r.id })); }}
        />
        <ProFormSelect
          name="sales_id" label="销售"
          request={async () => { const list = await getSales(); return list.map(r => ({ label: r.display_name, value: r.id })); }}
        />
        <ProFormSelect
          name="status" label="状态"
          options={Object.entries(STATUS_ENUM).map(([k, v]) => ({ label: v.text, value: k }))}
        />
        <ProFormSwitch name="is_confidential" label="保密" />
        <ProFormText name="work_hours" label="工时(h)" />
        <ProFormTextArea name="result_note" label="完成说明" />
      </DrawerForm>
    </PageContainer>
  );
};

export default Requests;
