import { useState } from "react";
import type { Locale } from "../../core/types";
import { message } from "../../i18n";

type Props = { locale: Locale; onCreate: (name: string) => void };

export function FirstRun({ locale, onCreate }: Props) {
  const [value, setValue] = useState("");
  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onCreate(trimmed);
  };

  return (
    <section className="tn-firstrun">
      <span className="tn-firstrun-kicker">{locale === "zh" ? "从一个真实任务开始" : "START WITH A REAL TASK"}</span>
      <h2>{message(locale, "v2FirstQuestion")}</h2>
      <p>{locale === "zh" ? "TabNexus 会把你接下来选择的浏览器页面，保存成这个任务可继续使用的上下文。" : "TabNexus turns the browser pages you choose into reusable task context."}</p>
      <div className="tn-firstrun-form">
        <input
          autoFocus
          value={value}
          placeholder={message(locale, "v2FirstQuestionExample")}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
        />
        <button type="button" className="tn-primary" disabled={!value.trim()} onClick={submit}>
          {message(locale, "v2CreateTaskAndCollect")}
        </button>
      </div>
      <div className="tn-firstrun-steps" aria-label={locale === "zh" ? "开始步骤" : "Getting started"}>
        <span><b>1</b>{locale === "zh" ? "定义问题" : "Define"}</span>
        <i />
        <span><b>2</b>{locale === "zh" ? "收集页面" : "Collect"}</span>
        <i />
        <span><b>3</b>{locale === "zh" ? "整理结论" : "Conclude"}</span>
      </div>
    </section>
  );
}
