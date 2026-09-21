"use client";

import { useEffect, useRef, useState } from "react";

type State = "idle" | "copied" | "manual";

/** Split a shell line into its command and its trailing comment. */
function parts(line: string): { code: string; comment: string | null } {
  const at = line.indexOf("#");
  if (at === -1) return { code: line, comment: null };
  return { code: line.slice(0, at), comment: line.slice(at) };
}

/**
 * A terminal block. Always dark, in either theme, because a shell reading as a
 * shell is worth more than theme consistency.
 *
 * The clipboard API is unavailable on non-secure origins and can be denied, so
 * the button never hides itself on a capability guess. On failure it selects
 * the text and says so, leaving the reader one keystroke away.
 */
export function CopyBlock({
  code,
  label = "Terminal",
  className = "",
}: {
  code: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<State>("idle");
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2500);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      const node = codeRef.current;
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setState("manual");
    }
  }

  const buttonText =
    state === "copied" ? "Copied" : state === "manual" ? "Selected — press ⌘C" : "Copy";

  return (
    <div
      className={`overflow-hidden rounded-xl border border-term-line bg-term-bg shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between border-b border-term-line bg-term-bar px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span aria-hidden className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-term-line" />
            <span className="h-2.5 w-2.5 rounded-full bg-term-line" />
            <span className="h-2.5 w-2.5 rounded-full bg-term-line" />
          </span>
          <span className="ml-1 font-mono text-[11px] uppercase tracking-wider text-term-dim">
            {label}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded px-2.5 py-1 font-mono text-[11px] font-medium text-term-dim transition-colors hover:bg-term-line hover:text-term-text"
        >
          {buttonText}
        </button>
      </div>

      <pre className="overflow-x-auto px-5 py-4 font-mono text-[13px] leading-[1.85]">
        <code ref={codeRef}>
          {code.split("\n").map((line, i) => {
            const { code: cmd, comment } = parts(line);
            return (
              <span key={i} className="block">
                <span aria-hidden className="mr-2.5 select-none text-term-accent">
                  $
                </span>
                <span className="text-term-text">{cmd.trimEnd()}</span>
                {comment && <span className="text-term-comment">{"  " + comment}</span>}
              </span>
            );
          })}
        </code>
      </pre>

      <span aria-live="polite" className="sr-only">
        {state === "copied" ? "Copied to clipboard" : state === "manual" ? "Text selected" : ""}
      </span>
    </div>
  );
}
