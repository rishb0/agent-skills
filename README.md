# Agent Skills

A growing collection of reusable skills for [OpenCode](https://opencode.ai), Claude Code, and any agent that reads a `SKILL.md` file. Each skill is a self-contained folder: instructions for the agent, optional scripts, and references it loads only when needed.

## Skills

| Skill | What it does | Docs |
| --- | --- | --- |
| [Router Reboot](router-reboot-skill/) | Reboots the home router on demand, and automatically when OpenCode's free-tier limit is reached, then resumes the interrupted sessions. Installs itself for Linux, macOS, and Windows. | [README](router-reboot-skill/README.md) · [SKILL.md](router-reboot-skill/SKILL.md) |
| [Internship Legitimacy Check](internship-legitimacy-check/) | Checks whether an internship or certificate provider sells placements instead of offering real work. Scores the evidence, writes a private verdict report, and advises on resume use. | [README](internship-legitimacy-check/README.md) · [SKILL.md](internship-legitimacy-check/SKILL.md) |

More skills will be added here as they are built. Every skill is a folder with a `SKILL.md` entry point, a human README, and optional references or scripts.

## Copy-paste prompts

Paste one of these into any agent that can read files and run commands (OpenCode, Claude Code, Codex, Cursor, and so on). Replace the `<...>` placeholders with your details. Nothing else needs editing.

**Install the skill and configure it for my router**

```text
Install the agent skill at https://github.com/rishb0/agent-skills/tree/main/router-reboot-skill.
Read its SKILL.md, follow the install steps for this OS, then help me configure it for my router.
Ask me for anything you need and do not guess.
```

**Install from a local clone**

```text
Read agent-skills/router-reboot-skill/SKILL.md and install this skill on this machine.
Then configure it for my router and verify it with the doctor and a dry run.
```

**Discover the router and write the config (no reboot)**

```text
Use the router-reboot-skill skill to discover my router, write its config, and verify it
with --check and --dry-run. Do not reboot yet.
```

**Turn on automatic reboot when the OpenCode free limit is hit**

```text
Use the router-reboot-skill skill to enable automatic reboot when my OpenCode free limit
is hit, and confirm the watcher is running.
```

**Reboot the router once, now**

```text
Reboot my router now with the router-reboot-skill skill. Warn me first, then run it.
```

**Fix a watcher that stopped working**

```text
The router-reboot-skill watcher is not working. Run its doctor, read the logs, and fix the cause.
```

**Check whether an internship company is selling internships**

```text
Is this internship genuine? <company name or website>. Use the internship-legitimacy-check skill.
Ask me for the offer letter, fee page, or screenshots you need. Do not pay, register, or contact the company.
Write the report and tell me the verdict and confidence.
```

**Check a company before accepting an offer**

```text
Check this internship company before I accept the offer: <paste the offer or give the file path>.
I have not paid yet. Use the internship-legitimacy-check skill. Check the registry, the domain, and the projects,
then tell me what is missing.
```

**Check an internship already on my resume**

```text
Run an internship legitimacy check on the internship I listed in my resume: <company>.
Tell me whether to keep it, move it to training, or leave it out.
```

**I already paid an internship company**

```text
Is this company selling internships? <company>. I already paid on <date>.
Use the internship-legitimacy-check skill. Tell me the verdict, what evidence to keep, and how to report it.
```

## Install a skill

Clone the repository, then install the skill you want. Skills with an installer are copied, configured, and registered for you; plain Markdown skills are copied as a folder.

```bash
git clone https://github.com/rishb0/agent-skills.git
```

**Router Reboot** has an installer:

```bash
bash agent-skills/router-reboot-skill/install.sh
```

It copies the skill into `~/.config/opencode/skills/router-reboot-skill/`, installs its dependencies, and sets up the background service for the current OS. Use `--claude` to install into `~/.claude/skills/` instead.

**Internship Legitimacy Check** has no dependencies and no installer:

```bash
mkdir -p ~/.config/opencode/skills
cp -r agent-skills/internship-legitimacy-check ~/.config/opencode/skills/
```

For Claude Code, copy it into `~/.claude/skills/` instead.

You can also point OpenCode at the whole collection without copying anything:

```jsonc
// opencode.jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "skills": ["./agent-skills"]
}
```

## Use a skill with any agent

Give the agent the path to the skill's `SKILL.md` and ask it to follow the steps. The file contains what the agent needs: requirements, procedure, verification, and the commands to run. Supporting references and scripts live next to it, and the agent loads them when the instructions say to.

## Repository layout

```text
agent-skills/
├── README.md                 # this file
├── LICENSE
├── .gitignore
├── router-reboot-skill/      # one folder per skill, named after the skill id
│   ├── SKILL.md              # agent entry point
│   ├── README.md             # human documentation
│   ├── install.sh            # Linux and macOS
│   ├── install.ps1           # Windows
│   ├── config/               # configuration example
│   ├── scripts/              # executable helpers
│   ├── references/           # deep documentation, loaded on demand
│   └── systemd/ launchd/ windows/   # per-OS service definitions
└── internship-legitimacy-check/
    ├── SKILL.md              # agent entry point
    ├── README.md             # human documentation
    └── references/           # portal paths and check details
```

## Development

`router-reboot-skill` is a normal Node package, so it can be tested on its own:

```bash
cd router-reboot-skill
npm ci
npm test
```

CI runs those tests on Ubuntu, macOS, and Windows. Every script resolves its own paths from its location, so a checkout and an installed copy behave the same; set `ROUTER_REBOOT_DATA` to keep logs out of the checkout.

`internship-legitimacy-check` is plain Markdown with no build step and no dependencies. To check a change, read `SKILL.md` and follow it against a company you already know, and confirm every relative link resolves.

## Requirements

- **Router Reboot:** Node.js 18 or newer, and a Chromium-based browser. Linux with systemd, macOS, or Windows for automatic start-up.
- **Internship Legitimacy Check:** a web browser, and optionally `whois` for domain age. No Node.js needed.
- Anything the agent itself needs, such as file read access and shell access for `whois`, comes from the harness.

## License

MIT. See [LICENSE](LICENSE).
