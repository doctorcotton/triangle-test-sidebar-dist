import chineseFontUrl from '../assets/ArialUnicode.ttf?url';

// 字体加载缓存
let cachedChineseFont: Uint8Array | null = null;
const FONT_MAGIC_LIST = ['OTTO', 'true', 'typ1', 'wOFF', 'wOF2'];

export function isValidFontBytes(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length < 4) return false;
  const sigStr = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (FONT_MAGIC_LIST.includes(sigStr)) return true;
  const sigNum = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
  // TrueType: 0x00010000
  return sigNum === 0x00010000;
}

export async function loadChineseFont(): Promise<Uint8Array | null> {
  console.log('[Font] 开始加载中文字体...');
  if (cachedChineseFont) {
    console.log('[Font] 使用缓存的字体, 大小:', cachedChineseFont.byteLength, 'bytes');
    return cachedChineseFont;
  }

  // 优先使用打包的本地字体（通过 Vite import 获取正确路径）
  console.log('[Font] 尝试加载打包的本地字体:', chineseFontUrl);
  try {
    const res = await fetch(chineseFontUrl);
    console.log('[Font] 响应状态:', res.status, res.statusText);
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      console.log('[Font] 获取到 buffer, 大小:', buffer.byteLength, 'bytes');
      if (buffer && buffer.byteLength > 10000) {
        const bytes = new Uint8Array(buffer);
        if (!isValidFontBytes(bytes)) {
          console.error('[Font] 文件签名异常，疑似下载到 HTML/404，而非字体文件');
          return null;
        }
        cachedChineseFont = bytes;
        console.log('[Font] ✓ 本地字体加载成功');
        return cachedChineseFont;
      }
    }
  } catch (err) {
    console.warn('[Font] 本地字体加载失败:', err);
  }

  console.error('[Font] ✗ 字体加载失败');
  return null;
}

// 检测字符串是否包含中文
export function containsChinese(str: string): boolean {
  return /[\u4e00-\u9fff]/.test(str);
}
