/**
 * 将请求路径原样拼接到 baseUrl 之后
 */
export function buildTargetUrl(baseUrl: string, reqUrl: string): URL {
  // 确保 baseUrl 末尾无斜杠
  const base = baseUrl.replace(/\/+$/, '');
  // reqUrl 应以 / 开头（来自 req.url）
  const path = reqUrl.startsWith('/') ? reqUrl : `/${reqUrl}`;
  return new URL(path, base);
}
