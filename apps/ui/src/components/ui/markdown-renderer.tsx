import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

interface MarkdownRendererProps {
  children: string;
}

/**
 * Internal markdown renderer component with all markdown dependencies.
 * This is kept separate to enable code-splitting.
 */
export function MarkdownRenderer({ children }: MarkdownRendererProps) {
  return <ReactMarkdown rehypePlugins={[rehypeRaw, rehypeSanitize]}>{children}</ReactMarkdown>;
}
