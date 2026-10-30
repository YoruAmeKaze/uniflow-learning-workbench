/**
 * 文件解析服务（输入处理步骤①）
 * 把上传的文件解析为纯文本，供步骤②意图识别使用。
 *
 * 设计（见《技术文档》附录 B）：
 * - MVP 支持文字版 PDF（unpdf 提取）与 TXT / Markdown
 * - 扫描版 PDF（无文字层）暂不支持：提取结果为空时由调用方提示
 * - 纯函数模块，不依赖 Context，便于测试与后续扩展（OCR 等）
 */
import { extractText } from 'unpdf'

/** 支持的文件扩展名（小写） */
export const SUPPORTED_EXTENSIONS = ['.pdf', '.txt', '.md'] as const

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number]

export interface ParsedFile {
  /** 原始文件名 */
  filename: string
  /** 小写扩展名（含点） */
  extension: string
  /** 提取出的文本（可能为空串，如扫描版 PDF） */
  text: string
  /** 文本长度（字符数） */
  length: number
}

/** 文件名扩展名是否受支持 */
export function isSupportedFile(filename: string): boolean {
  return SUPPORTED_EXTENSIONS.some((ext) => filename.toLowerCase().endsWith(ext))
}

/**
 * 解析文件内容为纯文本。
 * @throws Error 不支持的文件类型 / PDF 解析失败
 */
export async function parseFileToText(filename: string, buffer: Buffer): Promise<ParsedFile> {
  const extension = getExtension(filename)
  if (!extension) {
    throw new Error(`不支持的文件类型（${filename}），目前支持 PDF / TXT / Markdown`)
  }

  if (extension === '.pdf') {
    // unpdf 基于 pdf.js，纯 JS 解析文字版 PDF；无文字层的扫描版会得到空文本
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true })
    return { filename, extension, text, length: text.length }
  }

  // TXT / Markdown：按 UTF-8 解码
  const text = buffer.toString('utf-8')
  return { filename, extension, text, length: text.length }
}

function getExtension(filename: string): SupportedExtension | null {
  const lower = filename.toLowerCase()
  for (const ext of SUPPORTED_EXTENSIONS) {
    if (lower.endsWith(ext)) return ext
  }
  return null
}
