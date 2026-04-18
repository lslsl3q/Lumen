/**
 * 内置斜杠命令
 * 以后加新命令只需在这里 registerCommand() 一行
 */
import { registerCommand } from './registry';
import { compactSession, getTokenUsage } from '../api/chat';

// /compact — 手动触发上下文压缩
registerCommand({
  name: 'compact',
  description: '压缩上下文（摘要旧消息）',
  usage: '/compact',
  execute: async (_args, { sessionId }) => {
    if (!sessionId) return { success: false, message: '没有活跃的会话' };

    try {
      const result = await compactSession(sessionId);
      if (result.compacted) {
        return {
          success: true,
          message: `上下文已压缩: ${result.tokens_before} → ${result.tokens_after} tokens`,
        };
      }
      return { success: true, message: result.reason || '上下文未超过阈值，无需压缩' };
    } catch (err: any) {
      return { success: false, message: `压缩失败: ${err.message}` };
    }
  },
});

// /usage — 查看 token 使用情况
registerCommand({
  name: 'usage',
  description: '查看当前 token 使用情况',
  usage: '/usage',
  execute: async (_args, { sessionId }) => {
    if (!sessionId) return { success: false, message: '没有活跃的会话' };

    try {
      const usage = await getTokenUsage(sessionId);
      return {
        success: true,
        message: `Token: ${usage.current_tokens.toLocaleString()} / ${usage.context_size.toLocaleString()} (${usage.usage_percent}%) | 本次会话: 输入 ${usage.session_total_input} + 输出 ${usage.session_total_output}`,
      };
    } catch (err: any) {
      return { success: false, message: `获取用量失败: ${err.message}` };
    }
  },
});

// /help — 列出所有命令
registerCommand({
  name: 'help',
  description: '显示可用命令列表',
  usage: '/help',
  execute: async () => {
    // 动态导入避免循环依赖
    const { getAllCommands } = await import('./registry');
    const cmds = getAllCommands();
    const lines = cmds.map(
      (c) => `  /${c.name}${c.usage ? '  ' + c.usage : ''}  — ${c.description}`,
    );
    return {
      success: true,
      message: `可用命令:\n${lines.join('\n')}`,
    };
  },
});
