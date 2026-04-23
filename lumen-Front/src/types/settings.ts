/**
 * 设置页面共享导航类型
 *
 * List/Editor 页面通过 onBack/onNavigate 回调导航，
 * 在 SettingsOverlay 内用时走回调，直接路由访问时走 useNavigate 兜底。
 */

export interface SettingsPageProps {
  /** 关闭设置页，返回聊天 */
  onBack?: () => void;
  /** 导航到其他设置页面 */
  onNavigate?: (page: string, params?: { id?: string; resource?: string }) => void;
}
