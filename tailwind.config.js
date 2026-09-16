/** @type {import('tailwindcss').Config} */
module.exports = {
  // 仅在开发期启用，生产可去除（本项目为本地编译，保留无害）
  content: [
    './app/templates/**/*.html',
    './app/static/js/**/*.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Noto Sans SC', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.1rem',
      },
    },
  },
  // 不使用任何官方/第三方插件，纯本地编译，无 CDN 依赖
  plugins: [],
};
