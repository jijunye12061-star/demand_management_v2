import React, {useRef, useState, useEffect} from 'react';
import {PageContainer, ProTable, ActionType, ProColumns} from '@ant-design/pro-components';
import {Tag, message, Popconfirm} from 'antd';
import {getRequests, cancelRequest} from '@/services/api';
import type {RequestItem} from '@/services/typings';
import {STATUS_ENUM, REQUEST_TYPE_OPTIONS} from '@/utils/constants';
import RequestDetailDrawer from '@/components/RequestDetailDrawer';
import FileDownloadButton from '@/components/FileDownloadButton';
import StatsCards from '@/components/StatsCards';

const MyRequests: React.FC = () => {
  const actionRef = useRef<ActionType>(null);

  // 详情抽屉控制
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [currentRow, setCurrentRow] = useState<RequestItem | null>(null);

  // 统计卡片全量数据状态
  const [allMineRequests, setAllMineRequests] = useState<RequestItem[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  // 单独获取全量数据用于统计卡片
  const fetchStatsData = async () => {
    try {
      setStatsLoading(true);
      // page_size 设为 9999 拿全量
      const res = await getRequests({scope: 'mine', current: 1, pageSize: 9999});
      if (res && res.data) {
        setAllMineRequests(res.data);
      }
    } catch (error) {
      console.error('获取统计数据失败', error);
      message.error('统计数据加载失败');
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatsData();
  }, []);

  const columns: ProColumns<RequestItem>[] = [
    {
      title: '需求标题',
      dataIndex: 'title',
      copyable: true,
      ellipsis: true,
      render: (dom, entity) => (
        <a
          onClick={() => {
            setCurrentRow(entity);
            setDrawerVisible(true);
          }}
        >
          {dom}
        </a>
      ),
    },
    {
      title: '关键字搜索',
      dataIndex: 'keyword',
      hideInTable: true, // 只在搜索表单中展示
      fieldProps: {
        placeholder: '支持标题/描述模糊搜索',
      }
    },
    {
      title: '机构类型',
      dataIndex: 'org_type',
      valueType: 'select',
      hideInTable: true,
      valueEnum: {
        '银行': {text: '银行'},
        '券商': {text: '券商'},
        '保险': {text: '保险'},
        '私募': {text: '私募'},
        '外资': {text: '外资'},
        '其他': {text: '其他'},
      },
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
      fieldProps: {
        options: REQUEST_TYPE_OPTIONS,
      },
    },
    {
      title: '对接研究员',
      dataIndex: 'researcher_name',
      hideInSearch: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      valueType: 'select',
      valueEnum: STATUS_ENUM,
      render: (_, entity) => {
        const statusConfig = STATUS_ENUM[entity.status];
        return (
          <Tag color={statusConfig?.status?.toLowerCase()}>
            {statusConfig?.text || entity.status}
          </Tag>
        );
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      valueType: 'dateRange',
      hideInTable: true,
      search: {
        transform: (value) => {
          return {
            date_from: value[0],
            date_to: value[1],
          };
        },
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      valueType: 'dateTime',
      hideInSearch: true,
    },
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      width: 150,
      render: (_, entity) => [
        <a
          key="view"
          onClick={() => {
            setCurrentRow(entity);
            setDrawerVisible(true);
          }}
        >
          详情
        </a>,
        // 增加：只有「待处理(pending)」的需求才能撤回
        entity.status === 'pending' && (
          <Popconfirm
            key="cancel"
            title="确定要撤回这个需求吗？"
            description="撤回后该需求将被取消"
            onConfirm={async () => {
              try {
                await cancelRequest(entity.id);
                message.success('需求已撤回');
                actionRef.current?.reload(); // 刷新表格
                fetchStatsData(); // 重新拉取顶部统计卡片数据
              } catch (error) {
                console.error('撤回失败', error);
              }
            }}
          >
            <a style={{color: '#ff4d4f'}}>撤回</a>
          </Popconfirm>
        ),
        // 如果已完成且有附件，展示下载按钮
        entity.status === 'completed' && entity.attachment_path && (
          <FileDownloadButton
            key="download"
            requestId={entity.id}
            fileName={`${entity.title}-附件`}
            size="small"
          />
        ),
      ],
    },
  ];

  return (
    <PageContainer title="我的需求">
      {/* 顶部统计卡片 */}
      <StatsCards items={allMineRequests} loading={statsLoading}/>

      {/* 主数据表格 */}
      <ProTable<RequestItem>
        headerTitle="需求列表"
        actionRef={actionRef}
        rowKey="id"
        search={{
          labelWidth: 100,
        }}
        request={async (params) => {
          // 此处的 current 和 pageSize 是由 ProTable 自己管理的标准分页逻辑
          return getRequests({...params, scope: 'mine'});
        }}
        columns={columns}
      />

      {/* 挂载详情抽屉 */}
      <RequestDetailDrawer
        open={drawerVisible}
        onClose={() => {
          setDrawerVisible(false);
          setCurrentRow(null);
        }}
        request={currentRow}
      />
    </PageContainer>
  );
};

export default MyRequests;
