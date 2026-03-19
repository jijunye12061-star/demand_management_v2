export default {
  dev: {
    '/api/': {
      target: 'http://127.0.0.1:8000', // 指向你的 FastAPI 后端
      changeOrigin: true,
    },
  },
  // test 和 pre 暂时不用管
};
