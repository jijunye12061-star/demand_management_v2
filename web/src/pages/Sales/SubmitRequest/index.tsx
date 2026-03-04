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
import { Form, Card, App } from 'antd';
import { useNavigate } from '@umijs/max';
import { getOrganizations, getResearchers, createRequest } from '@/services/api';
import type { Organization } from '@/services/typings';
import { REQUEST_TYPE_OPTIONS, RESEARCH_SCOPE_OPTIONS, ORG_DEPARTMENT_MAP } from '@/utils/constants';
import dayjs from 'dayjs';

const SubmitRequest: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [orgList, setOrgList] = useState<Organization[]>([]);
  const { modal, message } = App.useApp();

  const handleFinish = async (values: any) => {
    const payload = {
      ...values,
      created_at: values.created_at
        ? dayjs(values.created_at).format('YYYY-MM-DD HH:mm:ss')
        : undefined,
    };

    const res = await createRequest(payload);

    if (res?.id) {
      modal.success({
        title: '需求提交成功！',
        content: '您的需求已发送给研究端，可在「我的需求」中随时追踪进度。',
        okText: '查看我的需求',
        cancelText: '继续提交',
        okCancel: true,
        onOk: () => navigate('/sales/mine'),
        onCancel: () => form.resetFields(),
      });
      return true;
    }

    message.error('提交失败，请重试');
    return false;
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
            rules={[{ required: true, message: '请输入需求标题' }]}
            colProps={{ span: 16 }}
          />
          <ProFormDateTimePicker
            name="created_at"
            label="提单时间"
            colProps={{ span: 8 }}
            fieldProps={{ style: { width: '100%' } }}
          />

          {/* 第二行：需求类型 + 研究范围 */}
          <ProFormSelect
            name="request_type"
            label="需求类型"
            options={REQUEST_TYPE_OPTIONS}
            rules={[{ required: true, message: '请选择需求类型' }]}
            colProps={{ span: 12 }}
          />
          <ProFormSelect
            name="research_scope"
            label="研究范围"
            options={RESEARCH_SCOPE_OPTIONS}
            colProps={{ span: 12 }}
          />

          {/* 第三行：机构 + 机构类型(自动) + 部门(级联) */}
          <ProFormSelect
            name="org_name"
            label="机构名称"
            rules={[{ required: true, message: '请选择机构' }]}
            colProps={{ span: 8 }}
            fieldProps={{
              showSearch: true,
              onChange: (val: string) => {
                const org = orgList.find((o) => o.name === val);
                form.setFieldsValue({
                  org_type: org?.org_type || undefined,
                  department: undefined,
                });
              },
            }}
            request={async () => {
              const orgs = await getOrganizations();
              setOrgList(orgs);
              return orgs.map((o) => ({ label: o.name, value: o.name }));
            }}
          />
          <ProFormText
            name="org_type"
            label="机构类型"
            colProps={{ span: 8 }}
            disabled
            fieldProps={{ placeholder: '选择机构后自动填入' }}
          />
          <ProFormDependency name={['org_type']}>
            {({ org_type }) => {
              const depts = ORG_DEPARTMENT_MAP[org_type];
              if (!depts) return <ProFormText name="department" label="对接部门" colProps={{ span: 8 }} disabled fieldProps={{ placeholder: '该机构类型无部门选项' }} />;
              return (
                <ProFormSelect
                  name="department"
                  label="对接部门"
                  colProps={{ span: 8 }}
                  options={depts.map((d) => ({ label: d, value: d }))}
                />
              );
            }}
          </ProFormDependency>

          {/* 第四行：研究员 + 保密 */}
          <ProFormSelect
            name="researcher_id"
            label="对接研究员"
            rules={[{ required: true, message: '请选择研究员' }]}
            colProps={{ span: 16 }}
            request={async () => {
              const list = await getResearchers();
              return list.map((r) => ({ label: r.display_name, value: r.id }));
            }}
          />
          <ProFormSwitch
            name="is_confidential"
            label="保密需求"
            colProps={{ span: 8 }}
          />

          {/* 第五行：描述 */}
          <ProFormTextArea
            name="description"
            label="需求描述"
            colProps={{ span: 24 }}
            fieldProps={{ rows: 4, placeholder: '请详细描述您的需求...' }}
          />
        </ProForm>
      </Card>
    </PageContainer>
  );
};

export default SubmitRequest;
