import React, { useRef, useState } from 'react';
import { PageContainer, ProTable, ProFormSelect, ProFormText, ProFormDateRangePicker, QueryFilter } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, App, Tag } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { getExportPreview, exportFullExcel } from '@/services/admin';
import { getResearchers, getSales } from '@/services/api';
import { STATUS_ENUM, REQUEST_TYPE_OPTIONS, RESEARCH_SCOPE_OPTIONS } from '@/utils/constants';
import RequestDetailDrawer from '@/components/RequestDetailDrawer';

const Export: React.FC = () => {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>(null);
  const [filterParams, setFilterParams] = useState<Record<string, any>>({});
  const [exporting, setExporting] = useState(false);

  // 详情抽屉
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [currentRow, setCurrentRow] = useState<any>(null);

  const handleExport = async () => {
    try {
      setExporting(true);
      // exportFullExcel 内部已完成下载，无需再处理 blob
      await exportFullExcel(filterParams);
      message.success('导出成功');
    } catch {
      message.error('导出失败');
    } finally {
      setExporting(false);
    }
  };

  const columns: ProColumns<any>[] = [
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (dom, entity) => (
        <a onClick={() => { setCurrentRow(entity); setDrawerVisible(true); }}>{dom}</a>
      ),
    },
    { title: '需求描述', dataIndex: 'description', ellipsis: true },
    { title: '需求类型', dataIndex: 'request_type', width: 100 },
    { title: '研究范围', dataIndex: 'research_scope', width: 100 },
    { title: '机构名称', dataIndex: 'org_name', width: 120, ellipsis: true },
    { title: '机构类型', dataIndex: 'org_type', width: 80 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (_, r) => {
        const cfg = STATUS_ENUM[r.status];
        return <Tag color={cfg?.status?.toLowerCase()}>{cfg?.text || r.status}</Tag>;
      },
    },
    { title: '研究员', dataIndex: 'researcher_name', width: 100 },
    { title: '销售', dataIndex: 'sales_name', width: 100 },
    { title: '工时', dataIndex: 'work_hours', width: 70 },
    { title: '创建时间', dataIndex: 'created_at', valueType: 'dateTime', width: 160 },
    { title: '完成时间', dataIndex: 'completed_at', valueType: 'dateTime', width: 160 },
  ];

  return (
    <PageContainer title="数据导出">
      <QueryFilter
        defaultCollapsed={false}
        onFinish={async (values) => {
          const p: Record<string, any> = { ...values };
          if (values.dateRange) {
            p.date_from = values.dateRange[0];
            p.date_to = values.dateRange[1];
            delete p.dateRange;
          }
          setFilterParams(p);
          actionRef.current?.reload();
        }}
        onReset={() => { setFilterParams({}); actionRef.current?.reload(); }}
      >
        <ProFormSelect name="status" label="状态" valueEnum={STATUS_ENUM} />
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
        scroll={{ x: 1400 }}
      />

      {/* 需求详情抽屉 */}
      <RequestDetailDrawer
        open={drawerVisible}
        onClose={() => { setDrawerVisible(false); setCurrentRow(null); }}
        request={currentRow}
        downloadMode="admin"
      />
    </PageContainer>
  );
};

export default Export;
