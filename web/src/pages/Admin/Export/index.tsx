import React, { useRef, useState } from 'react';
import { PageContainer, ProTable, ProFormSelect, ProFormText, ProFormDateRangePicker, QueryFilter } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, App, Tag } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { getExportPreview, exportFullExcel } from '@/services/admin';
import { getResearchers, getSales } from '@/services/api';
import { STATUS_ENUM, REQUEST_TYPE_OPTIONS, RESEARCH_SCOPE_OPTIONS } from '@/utils/constants';

const Export: React.FC = () => {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>(null);
  const [filterParams, setFilterParams] = useState<Record<string, any>>({});
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    try {
      setExporting(true);
      const blob = await exportFullExcel(filterParams);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `需求数据导出_${Date.now()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch {
      message.error('导出失败');
    } finally {
      setExporting(false);
    }
  };

  const columns: ProColumns<any>[] = [
    { title: '标题', dataIndex: 'title', ellipsis: true },
    { title: '需求类型', dataIndex: 'request_type', width: 100 },
    { title: '研究范围', dataIndex: 'research_scope', width: 90 },
    { title: '机构', dataIndex: 'org_name', ellipsis: true, width: 120 },
    { title: '机构类型', dataIndex: 'org_type', width: 80 },
    { title: '部门', dataIndex: 'department', width: 80 },
    { title: '销售', dataIndex: 'sales_name', width: 80 },
    { title: '研究员', dataIndex: 'researcher_name', width: 80 },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (_, r) => {
        const cfg = STATUS_ENUM[r.status];
        return <Tag color={cfg?.status?.toLowerCase()}>{cfg?.text || r.status}</Tag>;
      },
    },
    { title: '工时', dataIndex: 'work_hours', width: 60 },
    { title: '创建时间', dataIndex: 'created_at', valueType: 'dateTime', width: 150 },
    { title: '完成时间', dataIndex: 'completed_at', valueType: 'dateTime', width: 150 },
  ];

  return (
    <PageContainer>
      {/* 筛选区 */}
      <QueryFilter
        style={{ marginBottom: 16 }}
        onFinish={async (values) => {
          const params: Record<string, any> = { ...values };
          if (values.dateRange) {
            params.date_from = values.dateRange[0];
            params.date_to = values.dateRange[1];
            delete params.dateRange;
          }
          setFilterParams(params);
          actionRef.current?.reload();
        }}
        onReset={() => { setFilterParams({}); actionRef.current?.reload(); }}
      >
        <ProFormSelect name="status" label="状态" options={Object.entries(STATUS_ENUM).map(([k, v]) => ({ label: v.text, value: k }))} />
        <ProFormSelect name="request_type" label="需求类型" options={REQUEST_TYPE_OPTIONS} />
        <ProFormSelect name="research_scope" label="研究范围" options={RESEARCH_SCOPE_OPTIONS} />
        <ProFormSelect
          name="org_type" label="机构类型"
          options={['银行', '券商', '保险', '理财', 'FOF'].map(t => ({ label: t, value: t }))}
        />
        <ProFormSelect
          name="researcher_id" label="研究员"
          request={async () => { const list = await getResearchers(); return list.map(r => ({ label: r.display_name, value: r.id })); }}
        />
        <ProFormSelect
          name="sales_id" label="销售"
          request={async () => { const list = await getSales(); return list.map(r => ({ label: r.display_name, value: r.id })); }}
        />
        <ProFormDateRangePicker name="dateRange" label="日期范围" />
        <ProFormText name="keyword" label="关键字" />
      </QueryFilter>

      {/* 预览表 + 导出按钮 */}
      <ProTable
        headerTitle="数据预览"
        actionRef={actionRef}
        columns={columns}
        rowKey="id"
        search={false}
        toolBarRender={() => [
          <Button key="export" type="primary" icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
            导出 Excel (全字段)
          </Button>,
        ]}
        request={async (params) => {
          const res = await getExportPreview({
            ...filterParams,
            current: params.current,
            pageSize: params.pageSize,
          });
          return { data: res.items, total: res.total, success: true };
        }}
        pagination={{ pageSize: 20 }}
        size="middle"
        scroll={{ x: 1200 }}
      />
    </PageContainer>
  );
};

export default Export;
