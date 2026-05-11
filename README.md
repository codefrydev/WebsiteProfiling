# WebsiteProfiling

## Run with Docker

From the **repository root**:

```bash
docker compose up --build
```

Open **http://localhost:3088/home**. 

## Run locally

**1. Python** (repo root)

```bash
python -m venv .venv
```

Activate `.venv`, then:

```bash
pip install -r requirements.txt
```

Optional ML: `pip install -r requirements-ml.txt`

**2. Crawl / report** (creates `report.db` next to `input.txt`)

```bash
python -m src
```

Edit `input.txt` first, or use `python -m src --config other.txt`. Steps: `crawl`, `report`, `plot`, `lighthouse`, `keywords`, `warnings`, `enrich` as extra args.

**3. Next.js UI** (`web/`)

```bash
cd web
npm install
npm run dev
```

Open **http://localhost:3088/home**.


**4. Legacy Vite UI** (`UI/`) — optional

```bash
cd UI
npm install
npm run dev
```

Open **`http://localhost:5173/WebsiteProfiling/`**
