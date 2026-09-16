/** @type {import('tailwindcss').Config} */
export default {
  // 复用现有设计令牌：扫描 Flask 侧的模板与 input.css，
  // 这样 Vue 组件里用的 hsl(var(--x)) 令牌与原站一致。
  content: [
    './index.html',
    './src/**/*.{vue,ts}',
    '../app/templates/**/*.html',
    '../app/static/js/**/*.js',
    '../app/static/src/input.css',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'var(--font-cjk)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.1rem',
      },
    },
  },
  plugins: [],
}
