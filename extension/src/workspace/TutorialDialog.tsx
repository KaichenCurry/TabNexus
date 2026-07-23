import { useEffect, useState } from "react";
import type { Locale } from "../core/types";

type TutorialDialogProps = {
  locale: Locale;
  onDismiss: () => void;
  onOpenSettings: () => void;
};

const STEPS = [
  {
    icon: "🗂️",
    zh: {
      eyebrow: "基础 · 标签管理",
      title: "先保存，再放心关闭",
      body: "在右侧勾选当前窗口的标签，统一保存、关闭或重新打开。保存状态会清楚显示，固定标签永远不会被批量关闭。",
      points: ["多选标签后统一操作", "拖进分组即可保存归类", "卡片与关系图随时切换"]
    },
    en: {
      eyebrow: "BASICS · TAB MANAGEMENT",
      title: "Save first, then close with confidence",
      body: "Select tabs from the current window, then save, close, or reopen them together. Saved state stays visible, and pinned tabs are never closed in bulk.",
      points: ["Act on selected tabs together", "Drag into a group to save and organize", "Switch between cards and relationship map"]
    }
  },
  {
    icon: "✦",
    zh: {
      eyebrow: "进阶 · AI 整理",
      title: "按你的意图整理，不被固定分类限制",
      body: "在设置中选择一个 AI 服务并填写 API key，然后用一句话说明想怎样整理。TabNexus 会先给出可编辑预览，确认后才修改工作区。",
      points: ["支持类型、时间、阶段或任意意图", "只分析你选择的范围", "先预览、可调整、再应用"]
    },
    en: {
      eyebrow: "ADVANCED · AI ORGANIZATION",
      title: "Organize by intent, not a fixed taxonomy",
      body: "Choose an AI provider in Settings and add its API key, then describe the organization you want. TabNexus shows an editable preview before changing the workspace.",
      points: ["Use type, time, stage, or any intent", "Analyze only the scope you select", "Preview, adjust, then apply"]
    }
  },
  {
    icon: "↗",
    zh: {
      eyebrow: "协作 · 本地 Agent",
      title: "让 Agent 直接接着你的浏览任务做",
      body: "把 TabNexus 安装到 Codex、Claude Desktop、Cursor、VS Code 或 TRAE Work CN。Agent 可以读取上下文、整理工作区、操作标签并把报告写回来。",
      points: ["工作区上下文无需反复粘贴", "17 项 MCP 能力覆盖主要操作", "本地连接，不经过 TabNexus 云端"]
    },
    en: {
      eyebrow: "COLLABORATION · LOCAL AGENTS",
      title: "Let an Agent continue your browsing task",
      body: "Add TabNexus to Codex, Claude Desktop, Cursor, VS Code, or TRAE Work CN. Agents can read context, organize workspaces, operate tabs, and write reports back.",
      points: ["No repeated context copy-and-paste", "17 MCP tools cover core operations", "Local connection, no TabNexus cloud"]
    }
  }
] as const;

export function TutorialDialog({ locale, onDismiss, onOpenSettings }: TutorialDialogProps) {
  const [step, setStep] = useState(0);
  const content = STEPS[step][locale];
  const zh = locale === "zh";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
      if (event.key === "ArrowRight" && step < STEPS.length - 1) setStep((value) => value + 1);
      if (event.key === "ArrowLeft" && step > 0) setStep((value) => value - 1);
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [onDismiss, step]);

  const openSettings = () => {
    onDismiss();
    onOpenSettings();
  };

  return (
    <div className="tutorial-backdrop" role="presentation">
      <section className="tutorial-dialog" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
        <button className="tutorial-close" type="button" aria-label={zh ? "关闭教程" : "Close tutorial"} onClick={onDismiss}>×</button>
        <aside className="tutorial-steps" aria-label={zh ? "教程进度" : "Tutorial progress"}>
          <div className="tutorial-brand"><span>TN</span><div><strong>TabNexus</strong><small>{zh ? "两分钟上手" : "2-minute tour"}</small></div></div>
          <nav>
            {STEPS.map((item, index) => (
              <button key={item.zh.eyebrow} className={step === index ? "active" : step > index ? "done" : ""} type="button" onClick={() => setStep(index)}>
                <span>{step > index ? "✓" : index + 1}</span>
                <div><strong>{item.icon} {zh ? item.zh.eyebrow.split(" · ")[1] : item.en.eyebrow.split(" · ")[1]}</strong><small>{zh ? ["保存与恢复", "自定义整理", "共享任务上下文"][index] : ["Save and restore", "Custom organization", "Shared task context"][index]}</small></div>
              </button>
            ))}
          </nav>
          <p>🔒 {zh ? "你的工作区默认只保存在本机" : "Your workspace stays local by default"}</p>
        </aside>

        <div className="tutorial-main">
          <div className="tutorial-copy">
            <span className="tutorial-step-icon" aria-hidden="true">{STEPS[step].icon}</span>
            <div>
              <small>{content.eyebrow}</small>
              <h2 id="tutorial-title">{content.title}</h2>
              <p>{content.body}</p>
            </div>
          </div>

          <div className={`tutorial-preview step-${step + 1}`} aria-hidden="true">
            {step === 0 && (
              <div className="tutorial-tab-preview">
                <div className="tutorial-group-stack">
                  <span><i>📊</i><b>{zh ? "竞品研究" : "Competitor research"}</b><em>3</em></span>
                  <span><i>🧭</i><b>{zh ? "旅行计划" : "Trip planning"}</b><em>4</em></span>
                  <span><i>📚</i><b>{zh ? "稍后阅读" : "Read later"}</b><em>2</em></span>
                </div>
                <div className="tutorial-tab-rail">
                  <small>✓ {zh ? "已选 3 个" : "3 selected"}</small>
                  <span><i>G</i><b>Google Docs</b><em>{zh ? "已保存" : "Saved"}</em></span>
                  <span><i>N</i><b>Notion</b><em>{zh ? "未保存" : "Unsaved"}</em></span>
                  <strong className="tutorial-preview-action">{zh ? "保存并关闭 3" : "Save & close 3"}</strong>
                </div>
              </div>
            )}
            {step === 1 && (
              <div className="tutorial-ai-preview">
                <div className="tutorial-ai-query"><span>✦</span><p>{zh ? "按照「调研 → 决策 → 执行」三个阶段整理我勾选的标签" : "Organize selected tabs into Research → Decide → Execute"}</p><b>↑</b></div>
                <div className="tutorial-ai-result">
                  <small>{zh ? "整理预览" : "ORGANIZATION PREVIEW"}</small>
                  {["调研资料", "决策依据", "执行清单"].map((label, index) => <span key={label}><i /><b>{zh ? label : ["Research", "Decision inputs", "Action list"][index]}</b><em>{[5, 3, 4][index]}</em></span>)}
                </div>
              </div>
            )}
            {step === 2 && (
              <div className="tutorial-agent-preview">
                <div className="tutorial-agent-apps"><span>C</span><span>⌁</span><span>V</span><span>T</span></div>
                <div className="tutorial-agent-line"><i /><i /><i /></div>
                <div className="tutorial-agent-workspace"><small>TABNEXUS MCP</small><strong>{zh ? "同一个任务上下文" : "One shared task context"}</strong><p>{zh ? "读取 · 整理 · 操作标签 · 写回" : "Read · Organize · Operate tabs · Write back"}</p></div>
              </div>
            )}
          </div>

          <ul className="tutorial-benefits">
            {content.points.map((point) => <li key={point}><span>✓</span>{point}</li>)}
          </ul>

          <footer className="tutorial-footer">
            <button className="tutorial-never-show" type="button" onClick={onDismiss}>{zh ? "不再显示" : "Don't show again"}</button>
            <div className="tutorial-pagination" aria-hidden="true">{STEPS.map((_, index) => <i key={index} className={step === index ? "active" : ""} />)}</div>
            <div>
              {step > 0 && <button className="button secondary" type="button" onClick={() => setStep((value) => value - 1)}>{zh ? "上一步" : "Back"}</button>}
              {step < STEPS.length - 1
                ? <button className="button primary" type="button" onClick={() => setStep((value) => value + 1)}>{zh ? "下一步" : "Next"} →</button>
                : <button className="button primary" type="button" onClick={openSettings}>{zh ? "连接我的 Agent" : "Connect my Agent"} →</button>}
            </div>
          </footer>
        </div>
      </section>
    </div>
  );
}
