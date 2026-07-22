const AFFIRMATIVE_PREFIX = /^(?:我确认|本人确认|确认|i\s+(?:explicitly\s+)?confirm\b|confirmed\b)/i;
const DESTRUCTIVE_TERMS = /删除|移除|清空|清除|关闭|关掉|执行|delet(?:e|es|ed|ing|ion|ions)|remov(?:e|es|ed|ing|al|als)|clear(?:s|ed|ing)?|dismiss(?:es|ed|ing)?|clos(?:e|es|ed|ing)|execut(?:e|es|ed|ing|ion)|proceed(?:s|ed|ing)?/iu;
const WITHDRAWAL_INTENT = /\b(?:(?:cancel|abort|stop|revoke|undo)\s+(?:it|that|this|(?:(?:this|that|the)\s+)?(?:delet(?:e|ing|ion)|remov(?:e|ing|al)|clear(?:ing)?|clos(?:e|ing)|execut(?:e|ing|ion)|operation|request|action))|(?:do\s+not|don[’']t)\s+(?:proceed|do\s+(?:it|that|this))|never\s+mind|(?:revoke|withdraw)(?:\s+my)?\s+(?:confirmation|approval)|(?:i\s+)?(?:change|changed|have\s+changed)\s+my\s+mind|(?:take|taking|took)\s+(?:it|that)\s+back|(?:i\s+)?(?:take|took)\s+back\s+my\s+(?:confirmation|approval)|scratch\s+that|on\s+second\s+thought\s*[,;:]?\s*(?:do\s+not|don[’']t))\b|(?:\bbut\b|[,.;!?])\s*(?:actually\s+)?no\s*[.!?]*$|(?:\bbut\b|[,.;!?])\s*(?:(?:i|please|actually)\s+){0,2}(?:cancel|abort|stop|revoke|undo)(?:\s+(?:it|that|this|now|please))?\s*[.!?]*$|(?:取消|撤销|撤回|停止)(?:这个|该|这次|本次|我的)?(?:删除|移除|清空|清除|关闭|执行|操作|请求|确认|授权)|(?:但|但是|[，,;；。.!！？])\s*(?:我)?(?:取消|撤销|撤回|停止)(?:吧|了|操作)?\s*$|作废|算了|反悔|改变(?:了)?主意|收回(?:刚才|之前|我的)?(?:确认|同意|话)|(?:别|不要)(?:再)?(?:继续|执行|操作)(?:了)?/iu;
const MISSING_AUTHORIZATION = /\bwithout\s+(?:(?:the|your|my)\s+)?(?:user\s+)?(?:authorization|approval|consent|permission|confirmation)\b|\b(?:it|this|that|the\s+(?:deletion|removal|clearing|closing|execution|operation|request|action))\s+(?:is|was)\s+(?:unauthori[sz]ed|unapproved)\b|(?:但|但是|[，,;；。.!！？])\s*(?:该|这个|本次|此)?(?:删除|操作|请求)?(?:是)?(?:未经(?:用户)?(?:授权|批准|同意|许可|确认)|未获(?:用户)?(?:授权|批准|同意|许可|确认))/iu;
const NEGATIVE_BEFORE_TARGET = /不|未|没|别|取消|拒绝|并非|无需|反对|除外|避免|跳过|\b(?:do\s+not|does\s+not|did\s+not|don't|doesn't|didn't|not|never|no|without|won't|wouldn't|shouldn't|mustn't|can't|cannot|isn't|aren't|wasn't|weren't|haven't|hasn't|against|except\s+for|avoid|skip|abstain|refrain|oppose|refuse|cancel|decline)\b/iu;
const NEGATIVE_AFTER_TARGET = /别|取消|拒绝|并非|无需|反对|避免|跳过|不(?:是|代表|意味|应|要|能|可|想|同意|授权|确认|打算|允许)|未(?:被)?(?:授权|确认|同意|允许)|没(?:有)?(?:授权|确认|同意|允许)|\b(?:do\s+not|does\s+not|did\s+not|don't|doesn't|didn't|not|never|no|none|nothing|won't|wouldn't|shouldn't|mustn't|can't|cannot|isn't|aren't|wasn't|weren't|haven't|hasn't|against|avoid|skip|abstain|refrain|oppose|refuse|cancel|decline|unauthori[sz]ed|unapproved)\b/iu;
const BENIGN_NEGATIVE_DESCRIPTOR = /不(?:再)?需要(?:的)?(?:标签|页面|卡片|资料|记录)/gu;
const BARE_CONFIRMATION_REMAINDER = /^[\s，,:：;；。.!！？]*$/u;
const CLAUSE_BOUNDARY = /[，,;；。.!！？]|\b(?:but|however)\b|但是|但|不过|可是/iu;

function confirmationContext(text: string): string {
  return text.replace(BENIGN_NEGATIVE_DESCRIPTOR, "");
}

function termsForMatchedTarget(target: string): RegExp {
  if (/关闭|关掉|clos/iu.test(target)) return /关闭|关掉|关(?:了|上)?|clos(?:e|es|ed|ing)/iu;
  if (/清空|清除|clear/iu.test(target)) return /清空|清除|清掉|clear(?:s|ed|ing)?/iu;
  if (/移除|remov/iu.test(target)) return /移除|挪走|remov(?:e|es|ed|ing|al|als)/iu;
  if (/dismiss/iu.test(target)) return /删除|移除|清除|dismiss(?:es|ed|ing)?/iu;
  if (/执行|execut|proceed/iu.test(target)) return /执行|继续|execut(?:e|es|ed|ing|ion)|proceed(?:s|ed|ing)?/iu;
  return /删除|删(?:掉|了)?|delet(?:e|es|ed|ing|ion|ions)/iu;
}

function withdrawsSameActionInLaterClause(afterTarget: string, matchedTarget: string): boolean {
  const clauses = afterTarget.split(CLAUSE_BOUNDARY);
  if (clauses.length < 2) return false;
  const sameAction = termsForMatchedTarget(matchedTarget);
  const negativeLead = /\b(?:do\s+not|don[’']t|does\s+not|doesn[’']t|will\s+not|won[’']t|never|stop)\b|不要|别|不(?:再)?/iu;
  const anaphoricNegative = /\b(?:do\s+not|don[’']t|does\s+not|doesn[’']t|will\s+not|won[’']t|never)\s+(?:delete|remove|clear|dismiss|close|execute|proceed)\b[^,.;!?]{0,40}\b(?:it|this|that|them|these|those)\b|(?:我\s*)?(?:不要|别|不(?:再)?)\s*(?:删除|删掉|删|移除|清空|清除|关闭|关掉|关)\s*(?:它|它们|这个|这些|那些|该(?:项|条|个)?|了)/iu;
  const reversal = /\b(?:keep|retain|preserve)\s+(?:it|this|that|them|these|those)\b|\bleave\s+(?:it|this|that|them|these|those|(?:these|those|the)\s+(?:tabs?|pages?))\s+open\b|保留(?:它|它们|这个|这些|那些)|保持(?:它|它们|这个|这些|那些)?(?:打开|开启)/iu;
  const directPinnedExclusion = /\b(?:do\s+not|don[’']t|never)\s+clos(?:e|ing)\s+(?:the\s+)?(?:pinned|fixed)\s+(?:tabs?|pages?)\b|固定(?:的)?(?:标签|页面)[^，,;；。.!！？]{0,20}(?:不要|别|不再)[^，,;；。.!！？]{0,10}关闭|(?:不要|别|不再)[^，,;；。.!！？]{0,10}关闭[^，,;；。.!！？]{0,20}固定(?:的)?(?:标签|页面)/iu;
  return clauses.slice(1).some((clause) => {
    if (anaphoricNegative.test(clause) || reversal.test(clause)) return true;
    return negativeLead.test(clause) && sameAction.test(clause) && !directPinnedExclusion.test(clause);
  });
}

function termsForAction(action: string): RegExp {
  if (action.includes("close_browser_tabs")) return /关闭|关掉|clos(?:e|es|ed|ing)/iu;
  if (action.includes("dismiss_recent_tabs")) return /删除|移除|清除|delet(?:e|es|ed|ing|ion|ions)|remov(?:e|es|ed|ing|al|als)|clear(?:s|ed|ing)?|dismiss(?:es|ed|ing)?/iu;
  if (action.includes("manage_agent_activity")) return /删除|移除|清空|清除|delet(?:e|es|ed|ing|ion|ions)|remov(?:e|es|ed|ing|al|als)|clear(?:s|ed|ing)?/iu;
  return /删除|移除|清空|清除|delet(?:e|es|ed|ing|ion|ions)|remov(?:e|es|ed|ing|al|als)|clear(?:s|ed|ing)?/iu;
}

export function hasExplicitAgentConfirmation(confirm: unknown, confirmationText: unknown, action?: string): boolean {
  if (confirm !== true || typeof confirmationText !== "string" || confirmationText.length > 500) return false;
  const text = confirmationText.trim();
  if (text.length < 2) return false;

  const prefix = text.match(AFFIRMATIVE_PREFIX);
  if (!prefix) return false;
  const remainder = text.slice(prefix[0].length);
  if (WITHDRAWAL_INTENT.test(remainder) || MISSING_AUTHORIZATION.test(remainder)) return false;
  const target = remainder.match(action ? termsForAction(action) : DESTRUCTIVE_TERMS);
  if (!target || target.index === undefined) return BARE_CONFIRMATION_REMAINDER.test(remainder);

  const beforeTarget = remainder.slice(0, target.index);
  if (NEGATIVE_BEFORE_TARGET.test(confirmationContext(beforeTarget))) return false;

  const targetClause = remainder.slice(target.index + target[0].length).split(CLAUSE_BOUNDARY, 1)[0];
  if (NEGATIVE_AFTER_TARGET.test(confirmationContext(targetClause))) return false;
  return !withdrawsSameActionInLaterClause(remainder.slice(target.index + target[0].length), target[0]);
}

export function assertExplicitAgentConfirmation(confirm: unknown, confirmationText: unknown, action: string): void {
  if (confirm !== true) throw new Error(`${action} requires confirm=true`);
  if (!hasExplicitAgentConfirmation(confirm, confirmationText, action)) {
    throw new Error(`${action} requires confirmationText copied from the user's explicit confirmation`);
  }
}
