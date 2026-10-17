// stylelint：校验 css 与 .vue 内联 style 块（postcss-html 语法）。
// web 包的注入样式是 TS 模板字符串，不在 stylelint 边界内（架构 §6 单例注入）
export default {
  extends: ["stylelint-config-standard"],
  overrides: [
    {
      files: ["**/*.vue"],
      customSyntax: "postcss-html",
    },
  ],
};
