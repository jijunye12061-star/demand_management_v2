import React, { useRef, useState } from 'react';
import {
  PageContainer,
  ProTable,
  ModalForm,
  ProFormText,
  ProFormTextArea,
  ProFormSelect,
  ProFormSwitch,
  ProFormDependency,
} from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, Popconfirm, Tag, Space, Typography, App } from 'antd';
import { PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useModel } from '@umijs/max';
import {
  getMyTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  createRequestFromTemplate,
} from '@/services/templates';
import type { TemplateItem } from '@/services/templates';
import { getSales } from '@/services/api';
import { REQUEST_TYPE_OPTIONS, RESEARCH_SCOPE_OPTIONS, ORG_DEPARTMENT_MAP } from '@/utils/constants';

const { Text } = Typography;

/** 标题占位符预览 */
const renderTitlePreview = (pattern: string) => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString();
  // ISO week number
  const jan1 = new Date(y, 0, 1);
  const days = Math.floor((today.getTime() - jan1.getTime()) / 86400000);
  const week = String(Math.ceil((days + jan1.getDay() + 1) / 7)).padStart(2, '0');

  return pattern
    .replace('{date}', `${y}-${m}-${d}`)
    .replace('{week}', `${y}-W${week}`)
    .replace('{month}', `${y}-${m}`)
    .replace('{year}', String(y));
};

const ORG_TYPE_OPTIONS = ['银行', '券商', '保险', '理财', 'FOF', '信托', '私募', '期货', '其他'].map(
  (t) => ({ label: t, value: t }),
);

const Templates: React.FC = () => {
  const { message } = App.useApp();
  const { initialState } = useModel('@@initialState');
  const actionRef = useRef<ActionType>(null);

  // 编辑/新建 Modal
  const [editVisible, setEditVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TemplateItem | null>(null);

  // 从模板创建需求 Modal
  const [useVisible, setUseVisible] = useState(false);
  const [usingTemplate, setUsingTemplate] = useState<TemplateItem | null>(null);

  const columns: ProColumns<TemplateItem>[] = [
    {
      title: '模板名称',
      dataIndex: 'template_name',
      ellipsis: true,
      render: (dom, record) => (
        <a onClick={() => { setEditingRecord(record); setEditVisible(true); }}>{dom}</a>
      ),
    },
    {
      title: '标题模式',
      dataIndex: 'title_pattern',
      ellipsis: true,
      search: false,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text code>{record.title_pattern}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            → {renderTitlePreview(record.title_pattern)}
          </Text>
        </Space>
      ),
    },
    { title: '需求类型', dataIndex: 'request_type', valueType: 'select', fieldProps: { options: REQUEST_TYPE_OPTIONS }, width: 120 },
    { title: '研究范围', dataIndex: 'research_scope', search: false, width: 100 },
    { title: '机构', dataIndex: 'org_name', search: false, width: 100, ellipsis: true },
    {
      title: '保密',
      dataIndex: 'is_confidential',
      search: false,
      width: 60,
      render: (_, r) => r.is_confidential ? <Tag color="red">是</Tag> : <Tag>否</Tag>,
    },
    {
      title: '使用次数',
      dataIndex: 'usage_count',
      search: false,
      width: 80,
      sorter: (a, b) => a.usage_count - b.usage_count,
    },
    {
      title: '操作',
      valueType: 'option',
      width: 160,
      render: (_, record) => [
        <a
          key="use"
          onClick={() => { setUsingTemplate(record); setUseVisible(true); }}
        >
          <ThunderboltOutlined /> 使用
        </a>,
        <a key="edit" onClick={() => { setEditingRecord(record); setEditVisible(true); }}>
          编辑
        </a>,
        <Popconfirm
          key="del"
          title="确定删除该模板？"
          onConfirm={async () => {
            await deleteTemplate(record.id);
            message.success('已删除');
            actionRef.current?.reload();
          }}
        >
          <a style={{ color: '#ff4d4f' }}>删除</a>
        </Popconfirm>,
      ],
    },
  ];

  /** 新建/编辑模板的公共表单字段 */
  const templateFormFields = (
    <>
      <ProFormText
        name="template_name"
        label="模板名称"
        rules={[{ required: true, message: '请输入模板名称' }]}
        placeholder="如: 周报-量化组"
      />
      <ProFormText
        name="title_pattern"
        label="标题模式"
        rules={[{ required: true, message: '请输入标题模式' }]}
        placeholder="如: {month} 量化组周报"
        tooltip="占位符: {date}=2025-02-06, {week}=2025-W06, {month}=2025-02, {year}=2025"
      />
      <ProFormTextArea name="description" label="默认描述" fieldProps={{ rows: 3 }} />
      <ProFormSelect
        name="request_type"
        label="需求类型"
        options={REQUEST_TYPE_OPTIONS}
        rules={[{ required: true }]}
      />
      <ProFormSelect name="research_scope" label="研究范围" options={RESEARCH_SCOPE_OPTIONS} />
      <ProFormText name="org_name" label="机构名称" />
      <ProFormSelect name="org_type" label="机构类型" options={ORG_TYPE_OPTIONS} />
      <ProFormDependency name={['org_type']}>
        {({ org_type }) => {
          const depts = org_type ? ORG_DEPARTMENT_MAP[org_type] : [];
          if (!depts?.length) return null;
          return (
            <ProFormSelect
              name="department"
              label="对接部门"
              options={depts.map((d: string) => ({ label: d, value: d }))}
            />
          );
        }}
      </ProFormDependency>
      <ProFormSwitch name="is_confidential" label="保密" />
    </>
  );

  return (
    <PageContainer title="需求模板">
      <ProTable<TemplateItem>
        headerTitle="我的模板"
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={{ labelWidth: 'auto', defaultCollapsed: true }}
        request={async () => {
          const data = await getMyTemplates();
          return { data, success: true, total: data.length };
        }}
        pagination={{ defaultPageSize: 10 }}
        toolBarRender={() => [
          <Button
            key="new"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { setEditingRecord(null); setEditVisible(true); }}
          >
            新建模板
          </Button>,
        ]}
      />

      {/* ─── 新建/编辑模板 Modal ─── */}
      <ModalForm
        title={editingRecord ? '编辑模板' : '新建模板'}
        open={editVisible}
        onOpenChange={(v) => { if (!v) { setEditVisible(false); setEditingRecord(null); } }}
        initialValues={
          editingRecord
            ? { ...editingRecord, is_confidential: !!editingRecord.is_confidential }
            : { is_confidential: false }
        }
        modalProps={{ destroyOnClose: true }}
        onFinish={async (values) => {
          if (editingRecord) {
            await updateTemplate(editingRecord.id, values);
            message.success('模板已更新');
          } else {
            await createTemplate(values);
            message.success('模板已创建');
          }
          actionRef.current?.reload();
          return true;
        }}
      >
        {templateFormFields}
      </ModalForm>

      {/* ─── 从模板创建需求 Modal ─── */}
      <ModalForm
        title={
          usingTemplate
            ? `从模板创建: ${usingTemplate.template_name}`
            : '从模板创建需求'
        }
        open={useVisible}
        onOpenChange={(v) => { if (!v) { setUseVisible(false); setUsingTemplate(null); } }}
        modalProps={{ destroyOnClose: true }}
        onFinish={async (values) => {
          if (!usingTemplate) return false;
          const res = await createRequestFromTemplate(usingTemplate.id, {
            sales_id: values.sales_id,
            description: values.description,
          });
          message.success(`需求 #${res.request_id} 已创建: ${res.title}`);
          actionRef.current?.reload();
          return true;
        }}
      >
        {usingTemplate && (
          <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f5f5f5', borderRadius: 6 }}>
            <Text type="secondary">标题预览：</Text>
            <Text strong>{renderTitlePreview(usingTemplate.title_pattern)}</Text>
          </div>
        )}
        <ProFormSelect
          name="sales_id"
          label="选择销售"
          rules={[{ required: true, message: '请选择关联的销售' }]}
          request={async () => {
            const data = await getSales();
            return data.map((u) => ({ label: u.display_name, value: u.id }));
          }}
          fieldProps={{ showSearch: true }}
        />
        <ProFormTextArea
          name="description"
          label="补充说明（可选，覆盖模板默认描述）"
          fieldProps={{ rows: 3 }}
          initialValue={usingTemplate?.description}
        />
      </ModalForm>
    </PageContainer>
  );
};

export default Templates;
