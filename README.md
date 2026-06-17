# scratchboard

a local-first personal workspace with a local LLM built in.

the wall is the product. the chat is secondary.

you talk to bingus. at the end of the conversation, you hit checkpoint. a card gets made. the card lives on the wall. over time, the wall becomes your memory.

![scratchboard](screenshot.png)

---

## what it does

- **wall of cards** — persistent knowledge artifacts from your conversations
- **bingus** — a local LLM assistant that helps you think, not manage you
- **journal** — dated entries with bingus's observations
- **projects** — isolated workspaces with their own context and chat
- **quick capture** — throw thoughts in fast, promote to cards later
- **memories** — bingus quietly builds a picture of you over time

everything is local. no accounts. no cloud. no telemetry.

---

## requirements

- [node.js](https://nodejs.org) v18+
- [ollama](https://ollama.com) with at least one model pulled

---

## install

```bash
curl -fsSL https://raw.githubusercontent.com/neuromancer-dp/scratchboard/main/install.sh | bash
```

or manually:

```bash
git clone https://github.com/neuromancer-dp/scratchboard
cd scratchboard
npm install
```

---

## launch

make sure ollama is running first:

```bash
ollama serve
```

then:

```bash
node server.js
```

open [http://localhost:3747](http://localhost:3747)

or if you set up the alias:

```bash
scratchboard
```

---

## recommended models

any ollama model works. tested with:

- `mistral:7b-instruct`
- `llama3.2:3b` (fast, good for quick sessions)
- `nous-hermes2`
- `dolphin3:8b`

pull a model:

```bash
ollama pull mistral:7b-instruct
```

---

## data

everything lives in `bingus.db` (SQLite). export your workspace anytime from settings.

---

## stack

- node.js + express
- better-sqlite3
- plain html/css/js frontend
- ollama local LLM via `/v1/chat/completions`

---

made by [neuromancer](https://github.com/YOUR_USERNAME)
