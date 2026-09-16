/**
 * 图标文件选择助手：统一校验大小（≤1MB）并用 FileReader 读取为 data URL。
 * 超出限制时通过 ui 店的轻提示（Toast）告知，避免原生 alert 破坏交互风格。
 */
import { useUiStore } from '@/stores/ui'

const ICON_MAX_BYTES = 1024 * 1024

export function readIconFile(e: Event, onData: (dataUrl: string) => void): void {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (!f) return
  if (f.size > ICON_MAX_BYTES) {
    useUiStore().pushToast('图标文件过大，请控制在 1MB 以内', 'error')
    input.value = '' // 允许重新选择同一文件
    return
  }
  const reader = new FileReader()
  reader.onload = () => onData(reader.result as string)
  reader.readAsDataURL(f)
}
