import React, { useRef, useState } from 'react';
import {
  PageContainer,
  ProTable,
  ActionType,
  ProColumns,
} from '@ant-design/pro-components';
import {
  Tag,
  Popconfirm,
  Modal,
  Form,
  Input,
  InputNumber,
  Upload,
  Tabs,
  App,
} from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useModel } from '@umijs/max';
import { getRequests, acceptRequest, completeRequest, cancelRequest } from '@/services/api';
import type { RequestItem } from '@/services/typings';
import { STATUS_ENUM, REQUEST_TYPE_OPTIONS } from '@/utils/constants';
import RequestDetailDrawer from '@/components/RequestDetailDrawer';
import FileDownloadButton from '@/components/FileDownloadButton';

const MyTasks: React.FC = () => {
  const { message } = App.useApp();
  const { initialState } = useModel('@@initialState');
  const currentUserId = initialState?.currentUser?.id;

  const pendingRef = useRef<ActionType>(null);
  const progressRef = useRef<ActionType>(null);
  const completedRef = useRef<ActionType>(null);

  const [drawerVisible, setDrawerVisible] = useState(false);
  const [currentRow, setCurrentRow] = useState<RequestItem | null>(null);

  // 完成任务 Modal
  const [completeModalVisible, setCompleteModalVisible] = useState(false);
  const [completingId, setCompletingId] = useState<number>();
  const [completeForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [fileList, setFileList] = useState<any[]>([]);

  const openDetail = (record: RequestItem) => {
    setCurrentRow(record);
    setDrawerVisible(true);
  };

  const handleAccept = async (id: number) => {
    try {
      await acceptRequest(id);
      message.success('已接受任务');
      pendingRef.current?.reload();
      progressRef.current?.reload();
    } catch (err: any) {
      message.error(err?.message || '接受任务失败');
    }
  };

  const handleCancel = async (id: number) => {
    try {
      await cancelRequest(id);
      message.success('需求已撤回');
      pendingRef.current?.reload();
    } catch (err: any) {
      message.error(err?.message || '撤回失败');
    }
  };

  const openCompleteModal = (id: number) => {
    setCompletingId(id);
    setCompleteModalVisible(true);
    setFileList([]);
    completeForm.resetFields();
  };

  const handleComplete = async () => {
    try {
      const values = await completeForm.validateFields();
      setSubmitting(true);

      await completeRequest(completingId!, {
        result_note: values.result_note,
        work_hours: values.work_hours,
        attachment: fileList[0]?.originFileObj,
      });

      message.success('任务已完成');
      setCompleteModalVisible(false);
      progressRef.current?.reload();
      completedRef.current?.reload();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  // --- 共享列定义 ---
  const baseColumns: ProColumns<RequestItem>[] = [
    {
      title: '需求标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (dom, entity) => (
        <a onClick={() => openDetail(entity)}>{dom}</a>
      ),
    },
    {
      title: '关键字搜索',
      dataIndex: 'keyword',
      hideInTable: true,
      fieldProps: { placeholder: '支持标题/描述模糊搜索' },
    },
    {
      title: '机构名称',
      dataIndex: 'org_name',
      hideInSearch: true,
    },
    {
      title: '需求类型',
      dataIndex: 'request_type',
      valueType: 'select',
      hideInSearch: true,
      fieldProps: { options: REQUEST_TYPE_OPTIONS },
    },
    {
      title: '销售',
      dataIndex: 'sales_name',
      hideInSearch: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      hideInSearch: true,
      render: (_, entity) => {
        const cfg = STATUS_ENUM[entity.status];
        return <Tag color={cfg?.status?.toLowerCase()}>{cfg?.text || entity.status}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      valueType: 'dateTime',
      hideInSearch: true,
    },
  ];

  const pendingColumns: ProColumns<RequestItem>[] = [
    ...baseColumns,
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      width: 150,
      render: (_, entity) => [
        <Popconfirm
          key="accept"
          title="确定接受此任务？"
          onConfirm={() => handleAccept(entity.id)}
        >
          <a>接受</a>
        </Popconfirm>,
        <Popconfirm
          key="cancel"
          title="确定撤回这个需求？"
          description="撤回后该需求将被取消"
          onConfirm={() => handleCancel(entity.id)}
        >
          <a style={{ color: '#ff4d4f' }}>撤回</a>
        </Popconfirm>,
      ],
    },
  ];

  const progressColumns: ProColumns<RequestItem>[] = [
    ...baseColumns,
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      width: 100,
      render: (_, entity) => [
        <a key="complete" onClick={() => openCompleteModal(entity.id)}>
          完成
        </a>,
      ],
    },
  ];

  const completedColumns: ProColumns<RequestItem>[] = [
    ...baseColumns,
    {
      title: '工时(h)',
      dataIndex: 'work_hours',
      hideInSearch: true,
      width: 80,
    },
    {
      title: '完成时间',
      dataIndex: 'completed_at',
      valueType: 'dateTime',
      hideInSearch: true,
    },
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      width: 100,
      render: (_, entity) => [
        entity.attachment_path && (
          <FileDownloadButton
            key="download"
            mode="mine"
            requestId={entity.id}
            fileName={`${entity.title}-附件`}
            size="small"
          />
        ),
      ],
    },
  ];

  const tabItems = [
    {
      key: 'pending',
      label: '待处理',
      children: (
        <ProTable<RequestItem>
          actionRef={pendingRef}
          rowKey="id"
          search={{ labelWidth: 80 }}
          request={async (params) =>
            getRequests({ ...params, researcher_id: currentUserId, status: 'pending' })
          }
          columns={pendingColumns}
        />
      ),
    },
    {
      key: 'in_progress',
      label: '处理中',
      children: (
        <ProTable<RequestItem>
          actionRef={progressRef}
          rowKey="id"
          search={{ labelWidth: 80 }}
          request={async (params) =>
            getRequests({ ...params, researcher_id: currentUserId, status: 'in_progress' })
          }
          columns={progressColumns}
        />
      ),
    },
    {
      key: 'completed',
      label: '已完成',
      children: (
        <ProTable<RequestItem>
          actionRef={completedRef}
          rowKey="id"
          search={{ labelWidth: 80 }}
          request={async (params) =>
            getRequests({ ...params, researcher_id: currentUserId, status: 'completed' })
          }
          columns={completedColumns}
        />
      ),
    },
  ];

  return (
    <PageContainer title="我的任务">
      <Tabs items={tabItems} destroyInactiveTabPane />

      <RequestDetailDrawer
        open={drawerVisible}
        onClose={() => { setDrawerVisible(false); setCurrentRow(null); }}
        request={currentRow}
        downloadMode="mine"
      />

      <Modal
        title="完成任务"
        open={completeModalVisible}
        onCancel={() => setCompleteModalVisible(false)}
        onOk={handleComplete}
        confirmLoading={submitting}
        okText="确认完成"
        destroyOnClose
      >
        <Form form={completeForm} layout="vertical">
          <Form.Item name="result_note" label="处理说明">
            <Input.TextArea rows={3} placeholder="请填写处理结果说明" />
          </Form.Item>
          <Form.Item
            name="work_hours"
            label="工时（小时）"
            rules={[{ required: true, message: '请填写工时' }]}
          >
            <InputNumber
              min={0}
              step={0.5}
              precision={1}
              style={{ width: '100%' }}
              placeholder="如 2.5"
            />
          </Form.Item>
          <Form.Item label="上传附件">
            <Upload
              beforeUpload={() => false}
              maxCount={1}
              fileList={fileList}
              onChange={({ fileList: fl }) => setFileList(fl)}
            >
              <a><UploadOutlined /> 选择文件</a>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default MyTasks;
