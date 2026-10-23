# Installation and first deck

## 1. Install the public Agent skills

Node.js 24.18 or later, npm, and an Agent that supports skills are required.
Run these in the directory where you work with that Agent:

```bash
npx skills add https://github.com/busabase/templates/tree/main/templates/busa-ppt-factory
npx skills add busabase/skills --skill busabase --skill busabase-app-creator
```

Choose your Agent when the installer asks. The first command points at the
complete template directory, not the repository root. The second installs
workspace operation and app maintenance instructions. No private author
skill, catalog publishing skill, or separate PowerPoint skill is required
for the built-in workflow.

The installer reports the local directory it created. For a project-local
Codex installation, it is normally `.agents/skills/busa-ppt-factory`.
Ask the Agent to locate this skill's `SKILL.md` if your Agent uses another
location. All commands below run from that directory, which must contain
`busabase.json`, `content/`, `scripts/`, and `package.json`.

## 2. Install the workspace resources

In Busabase's template center, open **Busa PPT Factory**, sign in, choose
the intended Space, and use the installation prompt for your Agent. This
installs the application Folder, seven Bases with sample rows, and the
AirApp. Local skill installation alone creates none of those resources.

Before repeating an earlier partial installation, let the Agent inspect the
chosen Space, existing application-owned resources, and pending requests.
Reuse an existing installation; do not create a duplicate Folder or adopt
unrelated same-named Bases. For a first installation from a local package,
the Agent can use the public CLI after confirming the Space:

```bash
npx busabase-cli@latest login
npx busabase-cli@latest install .
```

The selected Space must be explicit in the connection or command. Follow
`busabase` for permission-aware writes and read the install result. If it
reports pending requests, review those exact requests in Busabase before
opening the AirApp. Never claim a queued install is running.

Open the installed AirApp and verify Overview, Projects, Decks, Slide cards,
Review, Style, Exports, and Settings. A real installation reads the chosen
Space; `?demo=...` is an offline illustration and does not validate it.
Give the user the actual installed AirApp link.

## 3. Prepare the trusted PPTX generator

Generating files happens in the Agent's trusted local process, not inside
the browser AirApp. From the installed skill root:

```bash
npm ci
node scripts/generate_pptx.mjs --help
```

`npm ci` installs the declared `busabase-sdk` and `pptxgenjs` dependencies
from this template's lockfile. It does not install workspace resources.
If you explicitly need local UI debugging, install the AirApp's own
packages with `npm --prefix content/busa-ppt-factory-app install`, then
run `npm --prefix content/busa-ppt-factory-app run dev`. Normal use opens
the installed AirApp instead.

Give trusted scripts their own `BUSABASE_BASE_URL`, `BUSABASE_SPACE_ID`,
and `BUSABASE_API_KEY` through a secure environment, following `busabase`.
The Space must match the AirApp's installation. Do not paste credentials
into chat, put them in AirApp files, or assume the browser session becomes
a command-line credential. Stop before writes if the target is ambiguous.

## 4. Review, generate, and inspect

Ask the Agent to create a project, a deck, its style system, and slide
cards in the installed Bases. Review the cards in **Review** and resolve
changes or blocks before approving the deck. Approval is a recorded
`decision-action: approve` on the deck; setting its status text to
`approved` alone does not authorize generation.

Use the deck's business `deck-id` field, not its Busabase record id:

```bash
node scripts/generate_pptx.mjs --deck=<deck-id>
```

An unapproved deck must be refused. An approved one produces
`exports/<deck-id>.pptx`, updates its generated slide count, and records an
export in the Space. Check the command result and read those rows back;
when the credential cannot write immediately, finish the pending review
before claiming the workspace has updated. `execute_decisions.mjs` only
plans follow-up work; it does not generate the PPTX.

The built-in output is a draft with visual-brief text, not automatically
created artwork. Open it in PowerPoint or LibreOffice, or render with
LibreOffice and Poppler when installed:

```bash
mkdir -p exports/rendered
soffice --headless --convert-to pdf --outdir exports/rendered exports/<deck-id>.pptx
pdftoppm -png -r 120 exports/rendered/<deck-id>.pdf exports/rendered/slide
```

Inspect every slide for overflow, cropped content, readability, and style
consistency. Replace visual briefs with approved assets and revise cards
before regenerating if needed. Record QA evidence in **QA checks** and the
render location in **Exports**. Do not call a draft final or deliver it to
clients until this QA is complete. External uploads or delivery require
the user's explicit authorization.
