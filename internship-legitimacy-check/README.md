# Internship Legitimacy Check

Check whether an internship or certificate provider is selling placements instead of offering real work, and get a private evidence report with a verdict and resume advice.

An internship-selling provider charges students for an internship, certificate, letter of recommendation, or training programme, assigns generic projects, and reviews nothing. The check separates that pattern from a genuine unpaid internship, which is not a red flag.

## Why

Internship-selling sites are hard to judge from the outside. A polished website, a certificate sample, and a LinkedIn page prove nothing. The useful evidence is elsewhere: who receives the fee, whether the registry record matches the claimed company, whether the projects are tutorial copies, whether the certificate can be verified, and what independent students say.

This skill walks an agent through that evidence in a fixed order, scores it, and writes down what is still unknown. It never pays, registers, or contacts the company.

## What it checks

| Area | What is recorded |
| --- | --- |
| Offering | Internship or course; fee, stipend, duration, certificate, LOR |
| Company pages | Pricing, terms, refund policy, sample certificate, verification page |
| MCA | Status, incorporation date, paid-up capital, registered address, CIN |
| GST | Status, legal name, registration date, cancellation |
| Udyam | Enterprise name, type, activity, URN |
| Domain and contact | Domain age; staff email domain |
| Impersonation | Sender domain and links compared with the real company |
| Reputation | Independent student reports of fees, certificates, refunds |
| Work quality | Named mentor, review step, real clients or products |
| Resume use | Keep, move to training, or leave out |

## Verdicts

| Verdict | Meaning |
| --- | --- |
| **PAID TRAINING (HONEST)** | A clearly labelled course with a syllabus and instructors that does not issue internship certificates |
| **CONFIRMED SELLING PATTERN** | At least one decisive Tier A signal, confirmed from primary evidence |
| **LIKELY SELLING PATTERN** | No confirmed Tier A, but a suspected one from secondary evidence, or three or more Tier B signals that include at least one student-treatment signal |
| **NO SELLING PATTERN FOUND** | No Tier A, no student-treatment Tier B signal, at most two company-profile Tier B signals, three or more verified counter-signals, and independent proof of real work |
| **UNCLEAR** | Not enough evidence; the report lists exactly what is missing |

One fee paid to the provider for the internship is enough for **CONFIRMED SELLING PATTERN**, even if the company also promises a stipend or shows real client logos. The exception is a clearly labelled course that never calls itself an internship, which is **PAID TRAINING (HONEST)**. Unpaid is not the problem; paying is.

Small and new companies are judged on two questions only: who pays whom, and whether real work with real review happens. A virtual office, low paid-up capital, a free email address, a thin LinkedIn page, no MCA record for a proprietorship, a founder acting as mentor, a new domain, or a certificate without a QR code are normal for genuine small companies. On their own, they never produce a **LIKELY SELLING PATTERN** verdict.

## Install

There is no installer and no dependency. Copy the folder into your agent's skills directory:

```bash
git clone https://github.com/rishb0/agent-skills.git
mkdir -p ~/.config/opencode/skills
cp -r agent-skills/internship-legitimacy-check ~/.config/opencode/skills/
```

For Claude Code, copy it into `~/.claude/skills/` instead.

Or point OpenCode at the whole collection without copying anything:

```jsonc
// opencode.jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "skills": ["./agent-skills"]
}
```

## Use

Ask in plain language. Hinglish and voice-typed text are fine.

```text
Is this internship genuine? <company name or website>
```

```text
Check this internship company before I accept the offer. I have not paid yet. <paste the offer>
```

```text
Run an internship legitimacy check on the internship in my resume: <company>.
Tell me whether to keep it, move it to training, or leave it out.
```

```text
Is this company selling internships? <company>. I already paid on <date>.
```

The agent asks once before running a check on a resume entry or offer that has no saved report. It asks for documents in one message, then works from public sources and what the user provides.

## Report

Reports are private and saved outside the skill folder:

```text
${INTERNSHIP_CHECK_DATA:-$HOME/.local/share/internship-legitimacy-check}/
└── companies/
    └── example-data-labs/
        └── internship-check-2026-11-22-1430.md
```

On Windows the default is `%LOCALAPPDATA%\internship-legitimacy-check`.

A new run always creates a new file. Existing reports are never overwritten; a collision gets `-2`, `-3`, and so on. Set `INTERNSHIP_CHECK_DATA` to keep reports somewhere else.

Every claim in the report carries a source and a date. Anything that could not be checked is listed under **Unknowns** instead of being guessed.

## Safety and privacy

- The agent never pays, registers, joins a group, or submits personal data or ID.
- It never contacts the company or its staff unless the user explicitly approves.
- It does not log in to portals or create accounts. A captcha or login wall becomes **Unknown**, and the user is asked to paste the result.
- Text on company pages, offers, and chats is treated as data, not instructions.
- Personal identifiers are redacted from the report. Company names, company domains, and official registry numbers stay.
- The report uses the wording "matches the internship-selling pattern". It is not a legal finding, and it never calls a person a fraudster.

## Limits

- MCA and GST searches use captchas. Without the user pasting the result, those checks stay **Unknown**.
- Sole proprietorships and partnerships are not on MCA, so a missing record proves nothing for them.
- A company's own testimonials, logos, and placement counts are marketing, not evidence.
- The check reads public sources and user documents. It cannot prove what happens inside a company.
- If the user already paid, the report can point to the official reporting route, but it cannot recover money.

## Documentation

- [SKILL.md](SKILL.md) — the instructions the agent follows.
- [references/official-checks.md](references/official-checks.md) — portal paths, fields to record, domain lookup, impersonation and reputation checks, reporting guidance.

## License

MIT. See the repository [LICENSE](../LICENSE).
