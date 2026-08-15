import { useMemo, useState } from "react";
import { message } from "../../i18n";
import type { Locale } from "../../core/types";
import { buildContextPacket, renderContextPacketMarkdown } from "../core/contextPacket";
import type { Task } from "../core/taskModel";

type Props = { task: Task; locale: Locale; onClose: () => void };

export function HandoffModal({ task, locale, onClose }: Props) {
  const packet = useMemo(() => buildContextPacket(task), [task]);
  const markdown = useMemo(() => renderContextPacketMarkdown(packet, locale), [packet, locale]);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时降级为文本选择
    }
  };

  const openDsh = () => window.open("http://127.0.0.1:3080", "_blank", "noopener");

  return (
    <div className="tn-modal-backdrop" onClick={onClose}>
      <div className="tn-modal" role="dialog" aria-label={message(locale, "v2LetAgentContinue")} onClick={(event) => event.stopPropagation()}>
        <header className="tn-modal-head">
          <strong>{message(locale, "v2LetAgentContinue")}</strong>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="tn-modal-body">
          <p className="tn-modal-scope">{message(locale, "v2HandoffProvide")}</p>
          <p className="tn-modal-scope">{message(locale, "v2HandoffNotProvide")}</p>
          <textarea className="tn-modal-textarea" readOnly value={markdown} rows={12} />
          <div className="tn-modal-actions">
            <button type="button" className="tn-secondary" onClick={openDsh}>{message(locale, "v2HandoffOpenDsh")}</button>
            <button type="button" className="tn-primary" onClick={() => void copy()}>
              {copied ? message(locale, "v2Copied") : message(locale, "v2HandoffCopy")}
            </button>
          </div>
          <p className="tn-modal-scope">{message(locale, "v2HandoffHint")}</p>
        </div>
      </div>
    </div>
  );
}
