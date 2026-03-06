"""
main.py – FastAPI application for the RouteMaster Order Picker.

Endpoints
---------
GET  /           → serves the frontend (static/index.html)
POST /api/solve  → accepts the warehouse grid JSON and returns the shortest path
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import List

from algorithm import find_shortest_path

app = FastAPI(title="RouteMaster Order Picker")


# ── Request / Response schemas ────────────────────────────────────────

class SolveRequest(BaseModel):
    """JSON body accepted by the /api/solve endpoint."""
    grid: List[List[int]] = Field(..., description="2-D warehouse grid")
    start: List[int] = Field(..., min_length=2, max_length=2,
                             description="[row, col] starting position")
    targets: List[List[int]] = Field(...,
                                     description="List of [row, col] target positions")
    algorithm: str = Field("bfs", description="Algorithm to use (bfs or astar)")


class SolveResponse(BaseModel):
    """JSON body returned by the /api/solve endpoint."""
    total_steps: int
    path: List[List[int]]
    targets_collected: int
    directions: List[str]
    status: str
    algorithm: str
    nodes_explored: int = 0
    metrics: dict = {}


# ── API route ─────────────────────────────────────────────────────────

@app.post("/api/solve", response_model=SolveResponse)
async def solve(req: SolveRequest):
    """Compute the shortest picking route."""

    # Basic validation
    rows = len(req.grid)
    if rows == 0:
        raise HTTPException(status_code=400, detail="Grid cannot be empty.")
    cols = len(req.grid[0])

    sr, sc = req.start
    if not (0 <= sr < rows and 0 <= sc < cols):
        raise HTTPException(status_code=400,
                            detail="Start position is out of grid bounds.")
    if req.grid[sr][sc] == 1:
        raise HTTPException(status_code=400,
                            detail="Start position is on an obstacle.")

    for t in req.targets:
        tr, tc = t
        if not (0 <= tr < rows and 0 <= tc < cols):
            raise HTTPException(status_code=400,
                                detail=f"Target {t} is out of grid bounds.")
        if req.grid[tr][tc] == 1:
            raise HTTPException(status_code=400,
                                detail=f"Target {t} is on an obstacle.")

    from algorithm import solve_warehouse
    result = solve_warehouse(req.grid, tuple(req.start),
                             [tuple(t) for t in req.targets],
                             algorithm=req.algorithm)

    if result is None:
        raise HTTPException(status_code=422,
                            detail="No valid path exists that visits all targets.")

    return SolveResponse(**result)


# ── Static files & SPA fallback ──────────────────────────────────────

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root():
    return FileResponse("static/index.html")
