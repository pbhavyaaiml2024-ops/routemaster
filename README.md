# RouteMaster Order Picker

A full-stack web application that calculates and visualizes the shortest warehouse item-picking route on a grid while avoiding obstacles.

## Algorithm

The solver uses **Breadth-First Search (BFS)** over an extended state space `(row, col, targets_bitmask)`.

- Each state tracks the picker's position **and** which targets have already been collected (encoded as a bitmask).
- BFS guarantees that the first time we reach the goal state (all targets collected) the path is the shortest.
- Movement is limited to the four cardinal directions; obstacles are impassable.

**Time complexity**: O(R × C × 2^T) where R×C is the grid size and T is the number of targets.

## How to Run

### Prerequisites
- Python 3.9+
- pip

### Steps

```bash
# 1. Navigate to the project folder
cd routemaster

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start the server
uvicorn main:app --reload
```

Open **http://127.0.0.1:8000** in your browser.

## Example Input

```json
{
  "grid": [[0,0,1],[0,2,1],[0,0,0]],
  "start": [0,0],
  "targets": [[1,1],[2,2]]
}
```

### Grid Legend

| Value | Meaning |
|-------|---------|
| `0`   | Walkable path |
| `1`   | Obstacle / Shelf |
| `2`   | Target item location |

## Example Output

```json
{
  "total_steps": 4,
  "path": [[0,0],[1,0],[2,0],[2,1],[2,2]],
  "targets_collected": 2
}
```

## Features

- **JSON input** – paste or upload a `.json` file
- **Grid visualization** – colour-coded warehouse map
- **Step-by-step animation** – watch the picker walk the route
- **Output JSON** – machine-readable result with total steps & path
- **Reset** – clear everything and start over

## Project Structure

```
routemaster/
├── main.py            # FastAPI app & /api/solve endpoint
├── algorithm.py       # BFS pathfinding module
├── requirements.txt   # Python dependencies
├── README.md
└── static/
    ├── index.html     # UI shell
    ├── styles.css     # Dark-mode design system
    └── script.js      # Client-side logic & animation
```
