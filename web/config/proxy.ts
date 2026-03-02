export default {
  dev: {
    '/api': {
      target: 'http://localhost:8000', // 这里指向你的 FastAPI 后端地址
      changeOrigin: true,
      pathRewrite: { '^': '' },
    },
  },
  test: {},
  pre: {},
};
