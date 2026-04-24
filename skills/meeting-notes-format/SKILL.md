---
name: meeting-notes-format
description: Defines how this app turns a meeting transcript into a polished Chinese meeting document and a TODO extraction JSON. Use when generating, changing, or reviewing final meeting notes, Lark cloud document content, or task extraction behavior for recorded meetings.
---

# Meeting Notes Format

## Output Contract

Generate two files from the transcript:

1. `output/meeting-notes.md`: a polished Chinese Markdown meeting note suitable for Lark Docs.
2. `output/tasks-review.json`: structured TODO candidates for Lark task creation.

The note must be useful even when speaker diarization is imperfect. Do not invent attendees, owners, dates, or decisions that are not supported by the transcript.

## Meeting Note Structure

Use this exact section order:

```markdown
# 会议标题

<Short title inferred from the meeting.>

# 会议概览

- <3-5 bullets summarizing meeting purpose, context, and outcome.>

# 关键结论

1. <Decision, conclusion, or important direction.>
2. <Decision, conclusion, or important direction.>

# TODO 列表

1. <Action item. Include due date only if explicit.>
2. <Action item. Include due date only if explicit.>

# 风险与待确认项

- <Risk, ambiguity, missing owner, missing deadline, or follow-up question.>
```

Keep language concise and business-ready. Prefer complete Chinese sentences. If the transcript contains English product names, people names, or acronyms, preserve them.

## TODO Extraction Rules

Extract only actionable work. A TODO should have a clear verb and a concrete outcome.

Include a TODO when the transcript implies one of these:

- A person or group needs to do follow-up work.
- A decision requires implementation.
- A risk requires investigation or mitigation.
- A metric, monitoring item, or process needs to be established.

Do not create TODOs for:

- General opinions or background information.
- Achievements already completed.
- Vague aspirations with no implied next action.
- Duplicate statements of the same work.

## `tasks-review.json` Schema

Write valid JSON:

```json
{
  "tasks": [
    {
      "summary": "Short action title",
      "description": "One paragraph describing the expected result.",
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

- Use `null` for owner fields unless the transcript explicitly states an owner and Lark lookup has verified the user.
- Use `null` for `due` unless a specific date or relative deadline is explicit.
- Set `auto_dispatch` to `true` for concrete tasks; set `false` only if the task needs human review before creation.
- Include 1-3 evidence strings with timestamps when available.

## Lark Document Style

Use standard Markdown that Lark Docs reliably imports:

- Headings, bullets, numbered lists, and simple paragraphs are preferred.
- Avoid complex HTML blocks unless explicitly needed.
- Do not duplicate the title in both the Lark document title and the first body line unless the app asks for a full standalone Markdown file.

## Adjustment Guide

To change the final meeting document style, edit this skill first. Common customizations:

- Add or remove sections in `Meeting Note Structure`.
- Change TODO strictness in `TODO Extraction Rules`.
- Add a required table or executive-summary style in `Lark Document Style`.
- Change whether low-confidence tasks should be dispatched automatically.
