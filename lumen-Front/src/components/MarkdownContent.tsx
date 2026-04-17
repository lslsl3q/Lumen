/**
 * Markdown 渲染组件 — Lumen 暗色主题
 *
 * 职责：把 AI 回复的 Markdown 文本渲染成富文本（代码高亮、表格、列表等）
 * 不碰状态，纯渲染组件
 */
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import '../styles/markdown.css';

interface MarkdownContentProps {
  content: string;
  isStreaming?: boolean;
}

/** Markdown 渲染 + 流式光标 */
export default function MarkdownContent({ content, isStreaming }: MarkdownContentProps) {
  return (
    <div className="markdown-body">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const codeText = String(children).replace(/\n$/, '');

            // 有语言标记的代码块 → 语法高亮
            if (match) {
              return (
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  className="markdown-code-block"
                >
                  {codeText}
                </SyntaxHighlighter>
              );
            }

            // 无语言标记但多行 → 也当代码块处理
            if (codeText.includes('\n')) {
              return (
                <SyntaxHighlighter
                  style={oneDark}
                  language="text"
                  PreTag="div"
                  className="markdown-code-block"
                >
                  {codeText}
                </SyntaxHighlighter>
              );
            }

            // 行内代码
            return (
              <code className="markdown-inline-code" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </Markdown>
      {/* 流式光标 */}
      {isStreaming && (
        <span className="inline-block w-[2px] h-[1.1em] bg-primary-light animate-cursor align-text-bottom ml-[1px]" />
      )}
    </div>
  );
}
