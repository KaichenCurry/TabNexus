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
      <h2>{message(locale, "v2FirstQuestion")}</h2>
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
    </section>
  );
}
