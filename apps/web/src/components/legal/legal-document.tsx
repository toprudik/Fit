import Link from "next/link";
import type { Block, Inline } from "@/lib/legal/markdown";

function InlineNodes({ nodes }: { nodes: Inline[] }) {
  return nodes.map((node, index) => {
    switch (node.kind) {
      case "text":
        return node.text;
      case "strong":
        return (
          <strong key={index} className="font-semibold">
            <InlineNodes nodes={node.children} />
          </strong>
        );
      case "em":
        return (
          <em key={index}>
            <InlineNodes nodes={node.children} />
          </em>
        );
      case "code":
        return (
          <code key={index} className="rounded-sm bg-surface-2 px-1 font-mono text-[0.9em]">
            {node.text}
          </code>
        );
      case "link": {
        const className = "text-accent-ink underline underline-offset-2";
        if (node.href.startsWith("/") || node.href.startsWith("#")) {
          return (
            <Link key={index} href={node.href} className={className}>
              <InlineNodes nodes={node.children} />
            </Link>
          );
        }
        return (
          <a key={index} href={node.href} target="_blank" rel="noopener noreferrer" className={className}>
            <InlineNodes nodes={node.children} />
          </a>
        );
      }
    }
  });
}

const HEADING = {
  1: "text-title-1",
  2: "text-title-2 pt-4",
  3: "text-title-3 pt-2",
  4: "text-headline",
} as const;

/** A legal document parsed by lib/legal/markdown: React elements only, no injected HTML. */
export function LegalDocument({ blocks, tableLabel }: { blocks: Block[]; tableLabel: string }) {
  return (
    <article className="flex flex-col gap-4 text-body">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "heading": {
            const Tag = `h${block.level}` as const;
            return (
              <Tag key={index} id={block.id} className={`${HEADING[block.level]} scroll-mt-6 break-words`}>
                <InlineNodes nodes={block.children} />
              </Tag>
            );
          }
          case "paragraph":
            return (
              <p key={index} className="break-words">
                <InlineNodes nodes={block.children} />
              </p>
            );
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag key={index} className={`flex flex-col gap-2 ps-5 ${block.ordered ? "list-decimal" : "list-disc"}`}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="break-words">
                    <InlineNodes nodes={item} />
                  </li>
                ))}
              </Tag>
            );
          }
          case "quote":
            return (
              <blockquote key={index} className="flex flex-col gap-2 rounded-md bg-surface-2 p-4 text-callout">
                {block.paragraphs.map((paragraph, paragraphIndex) => (
                  <p key={paragraphIndex} className="break-words">
                    <InlineNodes nodes={paragraph} />
                  </p>
                ))}
              </blockquote>
            );
          case "table":
            return (
              // Wide tables scroll on their own, the page never does (390 px).
              <div key={index} className="-mx-4 overflow-x-auto px-4" tabIndex={0} role="region" aria-label={tableLabel}>
                <table className="w-full min-w-[32rem] border-collapse text-subhead">
                  <thead>
                    <tr>
                      {block.header.map((cell, cellIndex) => (
                        <th key={cellIndex} scope="col" className="border-b border-line py-2 pe-3 text-start align-bottom font-semibold">
                          <InlineNodes nodes={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="border-b border-line py-2 pe-3 align-top">
                            <InlineNodes nodes={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "rule":
            return <hr key={index} className="border-line" />;
        }
      })}
    </article>
  );
}
