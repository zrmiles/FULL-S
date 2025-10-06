from typing import List, Optional, Dict
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from datetime import datetime
import uuid


class PollCreate(BaseModel):
    title: str
    description: Optional[str] = None
    deadlineISO: Optional[str] = None
    type: str = Field(default="single", pattern=r"^(single|multi)$")
    variants: List[str]
    maxSelections: Optional[int] = 1


class Poll(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    deadlineISO: Optional[str] = None
    type: str
    variants: List[Dict[str, str]]  # { id, label }
    maxSelections: int = 1


class VoteRequest(BaseModel):
    userId: str
    choices: List[str]


class ResultItem(BaseModel):
    id: str
    label: str
    count: int


class VoteResult(BaseModel):
    pollId: str
    total: int
    results: List[ResultItem]


app = FastAPI(title="Survey Backend", version="0.1.0")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost",
    "http://127.0.0.1",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

polls: Dict[str, Poll] = {}
votes: Dict[str, Dict[str, set]] = {}


@app.get("/")
def root():
    return {"name": "Survey Backend", "version": "0.1.0", "docs": "/docs"}


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


@app.get("/polls", response_model=List[Poll])
def list_polls():
    return list(polls.values())


@app.post("/polls", response_model=Poll, status_code=201)
def create_poll(body: PollCreate):
    if body.type == "multi" and (body.maxSelections is None or body.maxSelections < 1):
        raise HTTPException(status_code=400, detail="maxSelections must be >= 1 for multi polls")
    if len(body.variants) < 2:
        raise HTTPException(status_code=400, detail="Provide at least two variants")

    poll_id = str(uuid.uuid4())
    variant_objs = [{"id": str(uuid.uuid4()), "label": v} for v in body.variants]
    poll = Poll(
        id=poll_id,
        title=body.title,
        description=body.description,
        deadlineISO=body.deadlineISO,
        type=body.type,
        variants=variant_objs,
        maxSelections=body.maxSelections or 1,
    )
    polls[poll_id] = poll
    votes[poll_id] = {}
    return poll


@app.get("/polls/{poll_id}", response_model=Poll)
def get_poll(poll_id: str):
    poll = polls.get(poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    return poll


@app.post("/polls/{poll_id}/vote")
def vote(poll_id: str, body: VoteRequest):
    poll = polls.get(poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if not body.choices:
        raise HTTPException(status_code=400, detail="choices must be non-empty")

    variant_ids = {v["id"] for v in poll.variants}
    invalid = [c for c in body.choices if c not in variant_ids]
    if invalid:
        raise HTTPException(status_code=400, detail=f"invalid choices: {invalid}")

    if poll.type == "single" and len(body.choices) != 1:
        raise HTTPException(status_code=400, detail="single poll requires exactly one choice")
    if poll.type == "multi" and len(body.choices) > poll.maxSelections:
        raise HTTPException(status_code=400, detail=f"too many choices, max {poll.maxSelections}")

    user_votes = votes[poll_id].setdefault(body.userId, set())
    user_votes.clear()
    user_votes.update(body.choices)
    return {"status": "ok"}


@app.get("/polls/{poll_id}/results", response_model=VoteResult)
def get_results(poll_id: str):
    poll = polls.get(poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    counts: Dict[str, int] = {v["id"]: 0 for v in poll.variants}
    for _user, selected in votes.get(poll_id, {}).items():
        for c in selected:
            counts[c] = counts.get(c, 0) + 1

    total = sum(counts.values())
    items: List[ResultItem] = [
        ResultItem(id=v["id"], label=v["label"], count=counts.get(v["id"], 0))
        for v in poll.variants
    ]
    return VoteResult(pollId=poll_id, total=total, results=items)


@app.on_event("startup")
def seed_demo():
    if polls:
        return
    demo = PollCreate(
        title="Выбор старосты",
        description="Демо-опрос",
        deadlineISO=datetime.utcnow().isoformat(),
        type="single",
        variants=["Иван Петров", "Анна Смирнова", "Другое"],
        maxSelections=1,
    )
    created = create_poll(demo) 
    vote(created.id, VoteRequest(userId="u1", choices=[created.variants[0]["id"]]))  
    vote(created.id, VoteRequest(userId="u2", choices=[created.variants[1]["id"]]))
    vote(created.id, VoteRequest(userId="u3", choices=[created.variants[1]["id"]]))


