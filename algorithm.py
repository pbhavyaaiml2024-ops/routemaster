"""
algorithm.py – Shortest-path warehouse-picking solver.

Uses a BFS over the state space (row, col, targets_bitmask) to find the
shortest route from `start` that visits every target cell while avoiding
obstacle cells.

Grid cell values:
    0 → walkable path
    1 → obstacle / shelf
    2 → target item location (also walkable)
"""

from __future__ import annotations
from collections import deque
from typing import List, Tuple, Optional, Dict, Set, Any
import heapq


# ── Direction labels ─────────────────────────────────────────────────
_MOVE_NAMES: Dict[Tuple[int, int], str] = {
    (-1, 0): "UP",
    (1, 0):  "DOWN",
    (0, -1): "LEFT",
    (0, 1):  "RIGHT",
}


def _generate_directions(
    path: List[List[int]],
    target_set: Set[Tuple[int, int]],
) -> List[str]:
    """Convert a list of [row, col] path steps into readable directions.

    Returns a list of strings like:
        "Step 1: Move RIGHT → (0, 1)"
        "Step 2: Move DOWN  → (1, 1)  ★ Collected target!"
    """
    directions: List[str] = []
    if len(path) <= 1:
        return directions

    for i in range(1, len(path)):
        prev_r, prev_c = path[i - 1]
        cur_r, cur_c = path[i]
        dr, dc = cur_r - prev_r, cur_c - prev_c
        move = _MOVE_NAMES.get((dr, dc), "MOVE")
        line = f"Step {i}: Move {move} → ({cur_r}, {cur_c})"
        if (cur_r, cur_c) in target_set:
            line += "  ★ Collected target!"
        directions.append(line)

    return directions


import heapq

# Four cardinal directions (up, down, left, right)
DIRECTIONS: List[Tuple[int, int]] = [(-1, 0), (1, 0), (0, -1), (0, 1)]


def solve_warehouse(
    grid: List[List[int]],
    start: Tuple[int, int],
    targets: List[Tuple[int, int]],
    algorithm: str = "bfs"
) -> Optional[Dict]:
    """Unified entry point for warehouse pathfinding."""
    if algorithm.lower() == "astar":
        result = find_shortest_path_astar(grid, start, targets)
    else:
        result = find_shortest_path(grid, start, targets)
    
    if result:
        # Add additional metrics for the dashboard
        result["metrics"] = calculate_metrics(grid, start, targets, result["total_steps"])
    
    return result


def find_shortest_path(
    grid: List[List[int]],
    start: Tuple[int, int],
    targets: List[Tuple[int, int]],
) -> Optional[Dict]:
    """BFS-based shortest path to visit all targets."""
    rows = len(grid)
    cols = len(grid[0]) if rows else 0
    target_coord_set: Set[Tuple[int, int]] = {(t[0], t[1]) for t in targets}

    if not targets:
        return {
            "total_steps": 0, "path": [list(start)], "targets_collected": 0,
            "directions": [], "status": "completed", "algorithm": "bfs"
        }

    num_targets = len(targets)
    target_index: Dict[Tuple[int, int], int] = {(int(t[0]), int(t[1])): i for i, t in enumerate(targets)}
    all_collected = (1 << num_targets) - 1
    start_tuple = (int(start[0]), int(start[1]))
    init_mask = 1 << target_index[start_tuple] if start_tuple in target_index else 0

    if init_mask == all_collected:
        return {
            "total_steps": 0, "path": [list(start)], "targets_collected": num_targets,
            "directions": [], "status": "completed", "algorithm": "bfs"
        }

    queue: deque = deque([(start[0], start[1], init_mask, [list(start)])])
    visited = {(start[0], start[1], init_mask)}

    while queue:
        r, c, mask, path = queue.popleft()
        for dr, dc in DIRECTIONS:
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] != 1:
                new_mask = mask | (1 << target_index[(nr, nc)]) if (nr, nc) in target_index else mask
                if (nr, nc, new_mask) not in visited:
                    visited.add((nr, nc, new_mask))
                    new_path = path + [[nr, nc]]
                    if new_mask == all_collected:
                        return {
                            "total_steps": len(new_path) - 1,
                            "path": new_path,
                            "targets_collected": num_targets,
                            "directions": _generate_directions(new_path, target_coord_set),
                            "status": "completed",
                            "algorithm": "bfs",
                            "nodes_explored": len(visited)
                        }
                    queue.append((nr, nc, new_mask, new_path))
    return None


def find_shortest_path_astar(
    grid: List[List[int]],
    start: Tuple[int, int],
    targets: List[Tuple[int, int]],
) -> Optional[Dict]:
    """A*-based shortest path to visit all targets."""
    rows = len(grid)
    cols = len(grid[0]) if rows else 0
    target_coord_set: Set[Tuple[int, int]] = {(t[0], t[1]) for t in targets}
    
    if not targets:
        return {
            "total_steps": 0, "path": [list(start)], "targets_collected": 0,
            "directions": [], "status": "completed", "algorithm": "astar"
        }

    num_targets = len(targets)
    target_index: Any = {(int(t[0]), int(t[1])): i for i, t in enumerate(targets)}
    all_collected = (1 << num_targets) - 1
    start_tuple = (int(start[0]), int(start[1]))
    init_mask = 1 << target_index[start_tuple] if start_tuple in target_index else 0

    def heuristic(r: int, c: int, mask: int) -> int:
        """Manhattan distance to the nearest uncollected target."""
        remaining = [targets[i] for i in range(num_targets) if not (mask & (1 << i))]
        if not remaining: return 0
        return min(abs(r - tr) + abs(c - tc) for tr, tc in remaining)

    # Priority Queue entries: (f_score, g_score, r, c, mask, path)
    # f_score = g_score + heuristic
    pq = [(heuristic(start[0], start[1], init_mask), 0, start[0], start[1], init_mask, [list(start)])]
    visited = {} # (r, c, mask) -> min_g_score

    nodes_explored = 0
    while pq:
        f, g, r, c, mask, path = heapq.heappop(pq)
        nodes_explored += 1

        if (r, c, mask) in visited and visited[(r, c, mask)] <= g:
            continue
        visited[(r, c, mask)] = g

        if mask == all_collected:
            return {
                "total_steps": g,
                "path": path,
                "targets_collected": num_targets,
                "directions": _generate_directions(path, target_coord_set),
                "status": "completed",
                "algorithm": "astar",
                "nodes_explored": nodes_explored
            }

        for dr, dc in DIRECTIONS:
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] != 1:
                new_mask = mask | (1 << target_index[(nr, nc)]) if (nr, nc) in target_index else mask
                new_g = g + 1
                new_f = new_g + heuristic(nr, nc, new_mask)
                heapq.heappush(pq, (new_f, new_g, nr, nc, new_mask, path + [[nr, nc]]))

    return None


def calculate_metrics(
    grid: List[List[int]],
    start: Tuple[int, int],
    targets: List[Tuple[int, int]],
    optimal_steps: int
) -> Dict:
    """Calculate comparative metrics for the dashboard."""
    # 1. Naive (Greedy) Route: Always go to the nearest target next
    naive_steps = 0
    current = start
    remaining = set(tuple(t) for t in targets)
    
    # Simple BFS helper for greedy distance
    def get_dist(s, e):
        q = deque([(s[0], s[1], 0)])
        v = {s}
        while q:
            r, c, d = q.popleft()
            if (r, c) == e: return d
            for dr, dc in DIRECTIONS:
                nr, nc = r + dr, c + dc
                if 0 <= nr < len(grid) and 0 <= nc < len(grid[0]) and grid[nr][nc] != 1 and (nr, nc) not in v:
                    v.add((nr, nc))
                    q.append((nr, nc, d + 1))
        return float('inf')

    while remaining:
        nearest = min(remaining, key=lambda t: abs(current[0] - t[0]) + abs(current[1] - t[1]))
        dist = get_dist(current, nearest)
        if dist == float('inf'): break
        naive_steps += dist
        current = nearest
        remaining.remove(nearest)

    efficiency = (float(naive_steps) / optimal_steps * 100.0) if optimal_steps > 0 and naive_steps != float('inf') else 100.0
    time_saved = max(0, int(naive_steps) - optimal_steps) if naive_steps != float('inf') else 0
    
    return {
        "naive_steps": naive_steps if naive_steps != float('inf') else "N/A",
        "efficiency_gain": round(float(efficiency) - 100.0, 1) if efficiency > 100.0 else 0.0,
        "time_saved_score": time_saved,
        "path_optimization": f"{round(float(efficiency), 1)}%" if efficiency > 0 else "100%"
    }

