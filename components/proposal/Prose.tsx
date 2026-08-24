import { Fragment, type ReactNode } from "react";

/**
 * Minimal renderer for section bodies. Deliberately not a markdown library:
 * the model is instructed to emit only paragraphs, `- ` bullets, and **bold**,
 * and anything else should render as literal text rather than as markup we
 * didn't intend to allow into a client-facing document.
 */

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    out.push(<strong key={`${keyPrefix}-b${i++}`}>{match[1]}</strong>);
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Prose({ body }: { body: string }) {
  const blocks = body
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div className="doc-prose">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").map((l) => l.trim());
        const isList = lines.every((l) => l.startsWith("- "));

        if (isList) {
          return (
            <ul key={bi}>
              {lines.map((line, li) => (
                <li key={li}>{inline(line.slice(2), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }

        // Mixed block: render loose bullets inline with their paragraph.
        return (
          <p key={bi}>
            {lines.map((line, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(line.replace(/^- /, "• "), `${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
