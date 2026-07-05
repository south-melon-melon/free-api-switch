/*
 * afterPack 钩子：打包后删除不必要的文件以减小 exe 体积。
 *
 * 删除项：
 *   - LICENSES.chromium.html / LICENSE（许可证文件，不影响运行）
 *   - GPU 渲染相关 DLL（托盘应用无 BrowserWindow，不做 GPU 渲染）：
 *     libGLESv2.dll / libEGL.dll / vk_swiftshader.dll / vulkan-1.dll / d3dcompiler_47.dll
 */
const { join } = require('node:path');
const { rm } = require('node:fs/promises');

const REMOVE_FILES = [
  'LICENSES.chromium.html',
  'LICENSE',
  'libGLESv2.dll',
  'libEGL.dll',
  'vk_swiftshader.dll',
  'vulkan-1.dll',
  'd3dcompiler_47.dll',
];

exports.default = async function afterPack(context) {
  const { appOutDir } = context;
  for (const name of REMOVE_FILES) {
    await rm(join(appOutDir, name), { force: true });
  }
};
