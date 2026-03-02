export default [
  { path: '/login', component: './Login', layout: false },

  // 销售端
  {
    path: '/sales',
    name: '销售端',
    icon: 'ShoppingOutlined',
    access: 'sales', // 这里对应后面的权限控制
    routes: [
      { path: '/sales', redirect: '/sales/mine' }, // 默认进我的需求
      { path: '/sales/submit',  name: '提交需求',  component: './Sales/SubmitRequest' },
      { path: '/sales/mine',    name: '我的需求',  component: './Sales/MyRequests' },
      { path: '/sales/feed',    name: '需求动态',  component: './Sales/RequestFeed' },
    ],
  },

  // 研究端
  {
    path: '/researcher',
    name: '研究端',
    icon: 'ExperimentOutlined',
    access: 'researcher',
    routes: [
      { path: '/researcher', redirect: '/researcher/tasks' }, // 默认进我的任务
      { path: '/researcher/submit', name: '提交需求',  component: './Researcher/SubmitRequest' },
      { path: '/researcher/tasks',  name: '我的任务',  component: './Researcher/MyTasks' },
      { path: '/researcher/feed',   name: '需求动态',  component: './Researcher/RequestFeed' },
    ],
  },

  // 管理端
  {
    path: '/admin',
    name: '管理端',
    icon: 'DashboardOutlined',
    access: 'admin',
    routes: [
      { path: '/admin', redirect: '/admin/dashboard' }, // 默认进看板
      { path: '/admin/dashboard',  name: '工作量看板', component: './Admin/Dashboard' },
      { path: '/admin/analytics',  name: '多维分析',   component: './Admin/Analytics' },
      { path: '/admin/export',     name: '数据导出',   component: './Admin/Export' },
      {
        path: '/admin/settings',
        name: '系统管理',
        routes: [
          { path: '/admin/settings/users',    name: '用户管理', component: './Admin/Settings/Users' },
          { path: '/admin/settings/requests', name: '需求管理', component: './Admin/Settings/Requests' },
          { path: '/admin/settings/orgs',     name: '机构管理', component: './Admin/Settings/Orgs' },
          { path: '/admin/settings/teams',    name: '团队配置', component: './Admin/Settings/Teams' },
        ],
      },
    ],
  },

  // 兜底路由：输入没定义的网址时，默认回登录页
  { path: '/', redirect: '/login' },
  { path: '*', layout: false, component: './Login' },
];
