declare module '@pdf-lib/fontkit';

// 字体文件类型声明
declare module '*.ttf?url' {
  const url: string;
  export default url;
}
declare module '*.otf?url' {
  const url: string;
  export default url;
}
declare module '*.woff?url' {
  const url: string;
  export default url;
}
declare module '*.woff2?url' {
  const url: string;
  export default url;
}
