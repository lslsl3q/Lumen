/**
 * 全局 toast 通知
 *
 * 用法：import { toast } from '../utils/toast';
 *       toast('操作成功');
 *       toast('操作失败', 'error');
 *
 * 由 PushNotification 组件自动监听并显示。
 */

type ToastLevel = 'info' | 'success' | 'warning' | 'error';

const TOAST_EVENT = 'lumen:toast';

export function toast(message: string, level: ToastLevel = 'info') {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, {
    detail: { message, level },
  }));
}

export { TOAST_EVENT };
export type { ToastLevel };
