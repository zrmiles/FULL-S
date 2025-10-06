# Survey Backend (FastAPI)

## Run locally

```bash
cd /Users/uralazarev/Documents/survey-app/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

## Endpoints
- GET `/health` — health check
- GET `/polls` — list polls
- POST `/polls` — create poll
- GET `/polls/{poll_id}` — get poll
- POST `/polls/{poll_id}/vote` — vote (replaces previous user vote)
- GET `/polls/{poll_id}/results` — aggregated results
