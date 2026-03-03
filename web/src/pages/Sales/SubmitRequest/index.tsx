import React, { useState } from 'react';
import {
  PageContainer,
  ProForm,
  ProFormText,
  ProFormTextArea,
  ProFormSelect,
  ProFormSwitch,
  ProFormDateTimePicker,
  ProFormDependency,
} from '@ant-design/pro-components';
import { message, Form, Modal, Card } from 'antd';
import { useNavigate } from '@umijs/max';
import { getOrganizations, getResearchers, createRequest } from '@/services/api';
import type { Organization } from '@/services/typings';
import { REQUEST_TYPE_OPTIONS, RESEARCH_SCOPE_OPTIONS, ORG_DEPARTMENT_MAP } from '@/utils/constants';
import dayjs from 'dayjs';

const SubmitRequest: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [orgList, setOrgList] = useState<Organization[]>([]);

  const handleFinish = async (values: any) => {
    try {
      const payload = {
        ...values,
        created_at: values.created_at
          ? dayjs(values.created_at).format('YYYY-MM-DD HH:mm:ss')
          : undefined,
      };

      await createRequest(payload);

      Modal.success({
        title: '需求提交成功！',
        content: '您的需求已发送给研究端，可在「我的需求」中随时追踪进度。',
        okText: '查看我的需求',
        cancelText: '继续提交',
        okCancel: true,
        onOk: () => navigate('/sales/mine'),
        onCancel: () => form.resetFields(),
      });

      return true;
    } catch (error) {
      console.error('提交失败:', error);
      message.error('提交失败，请重试');
      return false;
    }
  };

  return (
    <PageContainer title="提交需求">
      <Card>
        <ProForm
          form={form}
          onFinish={handleFinish}
          initialValues={{ is_confidential: false, created_at: dayjs() }}
          layout="vertical"
          grid
          rowProps={{ gutter: [24, 0] }}
          submitter={{
            searchConfig: { submitText: '立即提交', resetText: '重置' },
            resetButtonProps: { style: { marginLeft: 8 } },
          }}
        >
          {/* 第一行：标题 + 提单时间 */}
          <ProFormText
            name="title"
            label="需求标题"
            colProps={{ span: 16 }}
            rules={[{ required: true, message: '请输入需求标题' }]}
            placeholder="请输入需求标题"
          />
          <ProFormDateTimePicker
            name="created_at"
            label="提单时间"
            colProps={{ span: 8 }}
            rules={[{ required: true }]}
            tooltip="默认当前，支持回溯"
          />

          {/* 第二行：需求描述（必填，跟在标题下方） */}
          <ProFormTextArea
            name="description"
            label="需求描述"
            colProps={{ span: 24 }}
            rules={[{ required: true, message: '请输入需求描述' }]}
            placeholder="请输入需求的详细背景、目标和要求"
            fieldProps={{ rows: 3 }}
          />

          {/* 第三行：需求类型 + 研究范围 */}
          <ProFormSelect
            name="request_type"
            label="需求类型"
            colProps={{ span: 12 }}
            options={REQUEST_TYPE_OPTIONS}
            rules={[{ required: true, message: '请选择需求类型' }]}
          />
          <ProFormSelect
            name="research_scope"
            label="研究范围"
            colProps={{ span: 12 }}
            options={RESEARCH_SCOPE_OPTIONS}
            placeholder="请选择研究范围"
          />

          {/* 第四行：目标机构 + 机构类型（只读） */}
          <ProFormSelect
            name="org_name"
            label="目标机构"
            colProps={{ span: 12 }}
            rules={[{ required: true, message: '请选择目标机构' }]}
            request={async () => {
              const data = await getOrganizations();
              setOrgList(data);
              return data.map((org) => ({ label: org.name, value: org.name }));
            }}
            fieldProps={{
              showSearch: true,
              onChange: (value: string) => {
                const selected = orgList.find((org) => org.name === value);
                if (selected) {
                  form.setFieldsValue({ org_type: selected.org_type, department: undefined });
                }
              },
            }}
          />
          <ProFormText
            name="org_type"
            label="机构类型"
            colProps={{ span: 12 }}
            readonly
            placeholder="选择机构后自动带入"
          />

          {/* 条件行：部门（仅银行/券商/保险） */}
          <ProFormDependency name={['org_type']}>
            {({ org_type }) => {
              const departments = org_type ? ORG_DEPARTMENT_MAP[org_type] : [];
              if (!departments?.length) return null;
              return (
                <ProFormSelect
                  name="department"
                  label="对接部门"
                  colProps={{ span: 12 }}
                  options={departments.map((d: string) => ({ label: d, value: d }))}
                  rules={[{ required: true, message: '请选择对接部门' }]}
                />
              );
            }}
          </ProFormDependency>

          {/* 第五行：研究员 + 保密开关 */}
          <ProFormSelect
            name="researcher_id"
            label="指定研究员"
            colProps={{ span: 12 }}
            rules={[{ required: true, message: '请选择研究员' }]}
            request={async () => {
              const data = await getResearchers();
              return data.map((u) => ({ label: u.display_name, value: u.id }));
            }}
            fieldProps={{ showSearch: true }}
          />
          <ProFormSwitch
            name="is_confidential"
            label="严格保密"
            colProps={{ span: 12 }}
            tooltip="开启后，需求动态大厅不可见"
          />
        </ProForm>
      </Card>
    </PageContainer>
  );
};

export default SubmitRequest;
