import { useMemo, useState } from "react";
import { exportWorkspaceJson, exportWorkspaceMarkdown, safeExportFilename } from "../../core/export";
import { message } from "../../i18n";
import type { Locale } from "../../core/types";
import { taskToWorkspaceView } from "../core/taskOps";
import type { Task } from "../core/taskModel";

type Props = { task: Task; locale: Locale; onClose: () => void };

export function ExportModal({ task, locale, onClose }: Props) {
  const workspace = useMemo(() => taskToWorkspaceView(task), [task]);
  const [format, setFormat] = useState<"markdown" | "json">("markdown");
  const [copied, setCopied] = useState(false);

  const content = format === "markdown"
    ? exportWorkspaceMarkdown(workspace, locale)
    : exportWorkspaceJson(workspace);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时降级为下载
      download();
    }
  };

  const download = () => {
    const filename = safeExportFilename(workspace, format === "markdown" ? "md" : "json");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="tn-modal-backdrop" onClick={onClose}>
      <div className="tn-modal" role="dialog" aria-label={message(locale, "export")} onClick={(event) => event.stopPropagation()}>
        <header className="tn-modal-head">
          <strong>⇧ {message(locale, "export")}</strong>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="tn-modal-body">
          <div className="tn-mode-list" role="group">
            <label className={format === "markdown" ? "active" : ""}>
              <input type="radio" name="export-format" checked={format === "markdown"} onChange={() => setFormat("markdown")} />
              Markdown
            </label>
            <label className={format === "json" ? "active" : ""}>
              <input type="radio" name="export-format" checked={format === "json"} onChange={() => setFormat("json")} />
              JSON
            </label>
          </div>
          <textarea className="tn-modal-textarea" readOnly value={content} rows={10} />
          <div className="tn-modal-actions">
            <button type="button" className="tn-secondary" onClick={download}>{message(locale, "download")}</button>
            <button type="button" className="tn-primary" onClick={() => void copy()}>{copied ? message(locale, "v2Copied") : message(locale, "copy")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
