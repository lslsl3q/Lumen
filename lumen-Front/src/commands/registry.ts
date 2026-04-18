/**
 * 斜杠命令注册中心
 * 通用框架：registerCommand() 注册，parseCommand() 解析，getAllCommands() 补全
 */

export interface CommandContext {
  sessionId: string | null;
}

export interface CommandResult {
  success: boolean;
  message: string;
}

export interface SlashCommand {
  name: string;
  description: string;
  usage?: string;
  execute: (args: string, context: CommandContext) => Promise<CommandResult>;
}

const commands = new Map<string, SlashCommand>();

export function registerCommand(cmd: SlashCommand) {
  commands.set(cmd.name, cmd);
}

export function getCommand(name: string): SlashCommand | undefined {
  return commands.get(name);
}

export function getAllCommands(): SlashCommand[] {
  return Array.from(commands.values());
}

export function parseCommand(input: string): { name: string; args: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) {
    return { name: trimmed.slice(1).toLowerCase(), args: '' };
  }
  return {
    name: trimmed.slice(1, spaceIdx).toLowerCase(),
    args: trimmed.slice(spaceIdx + 1),
  };
}

export async function executeCommand(
  input: string,
  context: CommandContext,
): Promise<CommandResult | null> {
  const parsed = parseCommand(input);
  if (!parsed) return null;

  const cmd = getCommand(parsed.name);
  if (!cmd) {
    return { success: false, message: `未知命令: /${parsed.name}。输入 /help 查看可用命令。` };
  }

  return cmd.execute(parsed.args, context);
}
