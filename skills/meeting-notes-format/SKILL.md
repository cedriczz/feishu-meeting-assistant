---
name: meeting-notes-format
description: Defines how this app turns a meeting transcript into a high-coverage Chinese meeting document and a TODO extraction JSON. Use when generating, changing, or reviewing final meeting notes, Lark cloud document content, or task extraction behavior for recorded meetings.
---

# Meeting Notes Format

## Goal

Turn a raw meeting transcript into a Feishu Minutes-level Chinese meeting document. The document should preserve enough factual detail that a person who missed the meeting can understand project status, risks, decisions, and follow-up work without reading the transcript.

Prioritize information coverage over aggressive brevity. Do not reduce a multi-topic meeting to a short executive summary.

## Required Outputs

Generate these files:

1. `output/cleaned-transcript.md`: a cleaned Markdown transcript digest.
2. `output/meeting-notes.md`: the final Chinese meeting note for Lark Docs.
3. `output/tasks-review.json`: structured TODO candidates for Lark task creation.

The app only requires `meeting-notes.md` and `tasks-review.json`, but `cleaned-transcript.md` is required by this skill as an audit trail for quality.

## Working Process

Follow this process before writing the final note:

1. Read the full transcript end to end.
2. Build a topic map: projects, regions, people, risks, metrics, decisions, deadlines, documents, external partners, blockers, and follow-up items.
3. Clean the transcript into `output/cleaned-transcript.md`:
   - Remove filler words, repeated口癖, false starts, and low-value chatter.
   - Keep concrete facts, numbers, names, dates, owners, dependencies, objections, and decisions.
   - Merge duplicate statements only after preserving the strongest evidence.
   - If speaker diarization is weak, use neutral phrasing such as “会上提到”.
4. Write `output/meeting-notes.md` from the topic map, not from memory.
5. Extract `output/tasks-review.json` from explicit or strongly implied follow-up work.

## Coverage Rules

The final note must not lose important information. Include:

- All named projects, regions, departments, partners, platforms, and initiatives discussed.
- Key numbers and dates, such as RSVP, budget, attendance, growth percentage, deadlines, counts, and completion rates.
- Risks, blockers, dependency issues, compliance concerns, budget limits, owner uncertainty, and schedule uncertainty.
- Decisions, consensus, changed plans, and rejected options.
- Follow-up documents, meetings, reminders, SOPs, reviews, confirmations, and owner handoffs.
- Contradictions or unresolved questions when the transcript is unclear.

If a meeting covers many topics, the note should be long enough to cover them. A long weekly review may need 1,500-3,500 Chinese characters or more.

## Final Note Structure

Use this exact section order in `output/meeting-notes.md`:

```markdown
# <会议主题>

<1 paragraph. Summarize what the meeting reviewed and what kind of work was arranged. Mention the major domains covered.>

## 重点项目

### <项目/区域/主题 1>（<状态标签>）

- **核心进展**：<most important progress, with numbers if available>
- **风险/阻塞**：<risk or blocker; write “暂无明确风险” only if supported>
- **下一步**：<next concrete action>

### <项目/区域/主题 2>（<状态标签>）

- **核心进展**：...
- **风险/阻塞**：...
- **下一步**：...

## 项目跟进表

| 地区/主题 | 项目内容 | 关键进展 | 状态 | 下一步/负责人 |
| --- | --- | --- | --- | --- |
| <region or topic> | <project> | <progress with facts> | <正常推进/进度滞后/需协调/高风险/已完成/待确认> | <owner/action/deadline or 待确认> |

## 详细纪要

### <主题组 1>

- **<事项标题>**：<detailed factual summary. Preserve names, numbers, dates, constraints, and implications.>
- **<事项标题>**：<detailed factual summary.>

### <主题组 2>

- **<事项标题>**：...

## 关键决策与核心共识

- <decision or consensus>
- <decision or consensus>

## 风险与待确认项

| 风险/问题 | 影响 | 当前判断 | 建议动作 |
| --- | --- | --- | --- |
| <risk> | <impact> | <current status> | <next action> |

## 待办事项

- [ ] **<TODO title>**：<expected result, owner if explicit, due date if explicit>
- [ ] **<TODO title>**：...

## 附：信息压缩说明

- <1-3 bullets explaining what was merged, de-duplicated, or left unresolved because the transcript was unclear.>
```

## Status Labels

Use one of these labels when possible:

- `正常推进`
- `进度滞后`
- `需协调`
- `高风险`
- `已完成`
- `待确认`

Do not overstate certainty. If status is inferred rather than explicitly said, write `待确认` or mention the uncertainty.

## Detail Style

Write in polished Chinese suitable for Lark Docs:

- Use concise business language, but keep substantive detail.
- Preserve English product names, names, acronyms, and platform names as spoken.
- Use bold labels for scanned reading, such as `**核心进展**` and `**风险/阻塞**`.
- Use Markdown tables for cross-project tracking and risks.
- Do not use HTML, Mermaid, SVG, or decorative markup.
- Do not invent owners, dates, decisions, metrics, or attendance.
- Do not hide weak evidence; write “未明确”, “待确认”, or “ transcript 未给出” when needed.

## TODO Extraction Rules

Extract actionable work. A TODO should have a clear verb and a concrete outcome.

Include a TODO when the transcript implies one of these:

- A person or group needs to do follow-up work.
- A document, SOP, report, deck, wiki, checklist, or process needs to be created or updated.
- A decision requires implementation or communication.
- A risk requires investigation, escalation, confirmation, or mitigation.
- A meeting, reminder, review, or deadline needs to be scheduled.
- A metric, monitoring item, or feedback loop needs to be established.

Do not create TODOs for:

- General opinions or background information.
- Achievements already completed.
- Vague aspirations with no implied next action.
- Duplicate statements of the same work.

When the owner is mentioned as a person name, put that name in `assignee_name` but keep `assignee_open_id` null unless a Lark lookup has verified the user. If no owner is clear, use null and describe the missing owner in the task description.

## `tasks-review.json` Schema

Write valid JSON:

```json
{
  "tasks": [
    {
      "summary": "Short action title",
      "description": "One paragraph describing the expected result, context, owner uncertainty, deadline, and source project.",
      "assignee_name": null,
      "assignee_open_id": null,
      "due": null,
      "reminder": null,
      "confidence": 0.85,
      "auto_dispatch": true,
      "evidence": ["[00:12:34] Evidence from transcript"]
    }
  ]
}
```

Rules:

- Use `null` for `assignee_open_id` unless Lark lookup has verified the user.
- Use `null` for `due` unless a specific date or relative deadline is explicit.
- Set `auto_dispatch` to `true` for concrete tasks; set `false` only if the task needs human review before creation.
- Include 1-3 evidence strings with timestamps when available.
- Keep task summaries short, but descriptions should preserve project context and expected deliverable.

## Quality Checklist

Before finishing, verify:

- The final note includes every major topic from the transcript.
- The project table covers all project/region/status combinations discussed.
- The detailed notes contain more information than the executive summary.
- Risks and blockers are not buried only inside prose.
- TODOs in JSON match the `## 待办事项` section.
- No unsupported facts were invented.
