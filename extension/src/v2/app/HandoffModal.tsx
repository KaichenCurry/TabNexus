import { useMemo, useState } from "react";
import { message } from "../../i18n";
import type { Locale } from "../../core/types";
import { buildContextPacket, renderContextPacketMarkdown } from "../core/contextPacket";
import type { Task } from "../core/taskModel";
import { Icon } from "./Icon";

type Props = { task: Task; locale: Locale; onOpenAgentSettings: () => void; onClose: () => void };

export function HandoffModal({ task, locale, onOpenAgentSettings, onClose }: Props) {
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

  return (
    <div className="tn-modal-backdrop" onClick={onClose}>
      <div className="tn-modal" role="dialog" aria-label={message(locale, "v2LetAgentContinue")} onClick={(event) => event.stopPropagation()}>
        <header className="tn-modal-head">
          <span><Icon name="agent" /><strong>{message(locale, "v2LetAgentContinue")}</strong></span>
          <button type="button" onClick={onClose} aria-label={message(locale, "closeModal")}><Icon name="close" /></button>
        </header>
        <div className="tn-modal-body">
          <div className="tn-handoff-intro">
            <strong>{locale === "zh" ? "把任务交给 Agent，而不是重新解释一遍" : "Hand off the task without re-explaining it"}</strong>
            <p>{message(locale, "v2HandoffProvide")}</p>
            <p>{message(locale, "v2HandoffNotProvide")}</p>
          </div>
          <textarea className="tn-modal-textarea" readOnly value={markdown} rows={12} />
          <div className="tn-modal-actions">
            <button type="button" className="tn-primary" onClick={() => void copy()}>
              {copied ? message(locale, "v2Copied") : message(locale, "v2HandoffCopy")}
            </button>
            <button type="button" className="tn-secondary" onClick={onOpenAgentSettings}>
              <Icon name="agent" />{locale === "zh" ? "Agent / MCP 接入" : "Agent / MCP setup"}
            </button>
          </div>
          <p className="tn-modal-scope">{locale === "zh" ? "已连接 TabNexus MCP 的 Agent 可以直接读取；也可以复制后粘贴到任意 Agent。" : "Connected Agents can read through TabNexus MCP, or you can paste this packet into any Agent."}</p>
        </div>
      </div>
    </div>
  );
}
