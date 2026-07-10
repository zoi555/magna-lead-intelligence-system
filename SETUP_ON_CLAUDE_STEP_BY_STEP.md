# Setup on Claude Code — Magna Lead Intelligence System

## 1. Create local folder

```bash
mkdir -p ~/Projects/magna/lead-intelligence-system
```

## 2. Copy this starter into the folder

After downloading and unzipping this pack:

```bash
cp -R ~/Downloads/magna-lead-intelligence-system-starter-v1/. ~/Projects/magna/lead-intelligence-system/
cd ~/Projects/magna/lead-intelligence-system
```

## 3. Check files are there

```bash
pwd
find . -maxdepth 2 -type f | sort | head -80
```

## 4. Initialise Git

```bash
git init
git add .
git commit -m "chore: add lead intelligence project documentation"
```

## 5. Create GitHub repo

With GitHub CLI:

```bash
gh repo create magna-lead-intelligence-system --private --source=. --remote=origin --push
```

Manual option:

1. Create private GitHub repo named `magna-lead-intelligence-system`.
2. Then run:

```bash
git remote add origin <github-repo-url>
git branch -M main
git push -u origin main
```

## 6. Open Claude Code

```bash
claude
```

Then paste the prompt in `CLAUDE_FIRST_PROMPT.md`.

## 7. Do not let Claude build yet

The first Claude session should only diagnose and prepare. Building before the missing postcode file, delivery postcode list, and CTO field validation is classic “run into the wall, then invoice for plaster” behaviour.
