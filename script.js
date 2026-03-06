/* ═══════════════════════════════════════════════════════════════
   RouteMaster Order Picker – Frontend Logic
   Handles JSON input, API calls, grid rendering, and animation.
   ═══════════════════════════════════════════════════════════════ */

(function () {
    "use strict";

    // ── DOM references ──────────────────────────────────────────
    const jsonInput = document.getElementById("json-input");
    const fileUpload = document.getElementById("file-upload");
    const runBtn = document.getElementById("run-btn");
    const resetBtn = document.getElementById("reset-btn");
    const algorithmSelect = document.getElementById("algorithm-select");

    const outputSection = document.getElementById("output-section");
    const totalStepsEl = document.getElementById("total-steps-value");
    const targetsCollEl = document.getElementById("targets-collected-value");
    const jsonOutputEl = document.getElementById("json-output");
    const errorBox = document.getElementById("error-box");
    const directionsList = document.getElementById("directions-list");
    const directionsPanel = document.getElementById("directions-panel");
    const completionBanner = document.getElementById("completion-banner");

    const gridContainer = document.getElementById("grid-container");
    const toolBtns = document.querySelectorAll(".tool-btn");
    const clearGridBtn = document.getElementById("clear-grid-btn");

    const view3DToggle = document.getElementById("view-3d-toggle");
    const threeContainer = document.getElementById("three-container");

    // ── State ───────────────────────────────────────────────────
    let animationTimer = null;   // handle for running animation
    let activeTool = "0";        // '0', '1', '2', or 'start'
    let activePayload = null;    // current parsed payload (grid, start, targets)
    let is3DMode = false;

    // Three.js state
    let scene, camera, renderer, pickerMesh;
    let gridGroup = null;
    let pathMeshes = [];

    // ── Event listeners ─────────────────────────────────────────
    runBtn.addEventListener("click", handleRun);
    resetBtn.addEventListener("click", handleReset);
    fileUpload.addEventListener("change", handleFileUpload);
    clearGridBtn.addEventListener("click", handleClearGrid);
    view3DToggle.addEventListener("change", (e) => {
        is3DMode = e.target.checked;
        if (is3DMode) {
            gridContainer.classList.add("hidden");
            threeContainer.classList.remove("hidden");
            if (!scene) init3DScene();
            if (activePayload) render3DGrid();
        } else {
            gridContainer.classList.remove("hidden");
            threeContainer.classList.add("hidden");
        }
    });

    toolBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            toolBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeTool = btn.dataset.tool;
        });
    });

    // ── File upload handler ─────────────────────────────────────
    function handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => { jsonInput.value = ev.target.result; };
        reader.readAsText(file);
    }

    // ── Reset ───────────────────────────────────────────────────
    function handleReset() {
        clearAnimation();
        jsonInput.value = "";
        outputSection.classList.add("hidden");
        errorBox.classList.add("hidden");
        completionBanner.classList.add("hidden");
        directionsList.innerHTML = "";
        resetStats();
        gridContainer.innerHTML = '<p class="placeholder-text">Paste JSON and click <strong>Run Algorithm</strong> to visualize the grid.</p>';
    }

    // ── Main run handler ────────────────────────────────────────
    async function handleRun() {
        clearAnimation();
        hideError();
        outputSection.classList.add("hidden");

        // 1. Parse input
        try {
            activePayload = JSON.parse(jsonInput.value);
        } catch (err) {
            showError("Invalid JSON: " + err.message);
            return;
        }

        // Basic sanity checks
        if (!activePayload.grid || !activePayload.start || !activePayload.targets) {
            showError("JSON must contain 'grid', 'start', and 'targets' fields.");
            return;
        }

        // 2. Render the initial grid
        renderGrid(activePayload.grid, activePayload.start, activePayload.targets, []);

        // 3. Call the backend
        runBtn.classList.add("loading");
        runBtn.innerHTML = '<span class="btn-icon">⏳</span> Solving…';

        try {
            const res = await fetch("/api/solve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...activePayload,
                    algorithm: algorithmSelect.value
                }),
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.detail || `Server error (${res.status})`);
            }

            const data = await res.json();

            // 4. Show output
            totalStepsEl.textContent = data.total_steps;
            targetsCollEl.textContent = data.targets_collected;
            jsonOutputEl.textContent = JSON.stringify(data, null, 2);
            outputSection.classList.remove("hidden");
            completionBanner.classList.add("hidden");

            // 5. Update stats dashboard
            updateStatsDashboard(data);

            // 6. Render directions list
            renderDirections(data.directions || []);

            // 7. Animate path
            if (is3DMode) {
                animatePath3D(data.path, activePayload.targets);
            } else {
                animatePath(activePayload.grid, activePayload.start, activePayload.targets, data.path);
            }

        } catch (err) {
            showError(err.message);
        } finally {
            runBtn.classList.remove("loading");
            runBtn.innerHTML = '<span class="btn-icon">▶</span> Run Algorithm';
        }
    }

    // ── Grid rendering ──────────────────────────────────────────

    /**
     * Build an HTML <table> representing the warehouse grid.
     *
     * @param {number[][]} grid      - 2-D grid array
     * @param {number[]}   start     - [row, col]
     * @param {number[][]} targets   - list of [row, col]
     * @param {number[][]} pathCells - list of [row, col] in the solution path
     */
    function renderGrid(grid, start, targets, pathCells) {
        const rows = grid.length;
        const cols = grid[0].length;

        // Build look-up sets for quick classification
        const startKey = key(start);
        const targetSet = new Set(targets.map(key));
        const pathSet = new Set(pathCells.map(key));

        let html = '<table class="grid-table">';
        for (let r = 0; r < rows; r++) {
            html += "<tr>";
            for (let c = 0; c < cols; c++) {
                const k = key([r, c]);
                let cls = "grid-cell";
                let label = "";

                if (k === startKey) { cls += " cell-start"; label = "S"; }
                else if (grid[r][c] === 1) { cls += " cell-obstacle"; label = "▧"; }
                else if (targetSet.has(k)) { cls += " cell-target"; label = "★"; }

                html += `<td id="cell-${r}-${c}" class="${cls}" data-r="${r}" data-c="${c}">${label}</td>`;
            }
            html += "</tr>";
        }
        html += "</table>";
        gridContainer.innerHTML = html;

        // Attach click listeners to new cells
        gridContainer.querySelectorAll(".grid-cell").forEach(cell => {
            cell.addEventListener("click", () => handleCellClick(parseInt(cell.dataset.r), parseInt(cell.dataset.c)));
        });
    }

    // ── Path animation ──────────────────────────────────────────

    /**
     * Step-by-step animate the picker moving along the solved path.
     */
    function animatePath(grid, start, targets, path) {
        if (!path || path.length === 0) return;

        const targetSet = new Set(targets.map(key));
        let step = 0;

        animationTimer = setInterval(() => {
            // Remove picker class from previous cell
            if (step > 0) {
                const prev = path[step - 1];
                const prevCell = cellEl(prev);
                prevCell.classList.remove("cell-picker");
                // Leave a permanent path highlight
                prevCell.classList.add("cell-path", "cell-path-anim");
                // Restore target label if it was a target
                if (key(prev) === key(start)) {
                    prevCell.classList.add("cell-start");
                    prevCell.textContent = "S";
                } else if (targetSet.has(key(prev))) {
                    prevCell.classList.add("cell-target");
                    prevCell.textContent = "✓";
                }
            }

            if (step >= path.length) {
                clearInterval(animationTimer);
                animationTimer = null;
                // ── Show completion banner ──
                completionBanner.classList.remove("hidden");
                return;
            }

            // Highlight the current direction step
            highlightDirection(step);

            const cur = path[step];
            const curCell = cellEl(cur);
            curCell.classList.add("cell-picker");
            curCell.textContent = "🚶";

            step++;
        }, 220);
    }

    // ── Helpers ──────────────────────────────────────────────────

    function key(coord) { return `${coord[0]},${coord[1]}`; }
    function cellEl(coord) { return document.getElementById(`cell-${coord[0]}-${coord[1]}`); }

    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.classList.remove("hidden");
    }
    function hideError() { errorBox.classList.add("hidden"); }

    function clearAnimation() {
        if (animationTimer) { clearInterval(animationTimer); animationTimer = null; }
    }

    /**
     * Render turn-by-turn directions into the directions list.
     */
    function renderDirections(directions) {
        directionsList.innerHTML = "";
        if (directions.length === 0) {
            directionsPanel.classList.add("hidden");
            return;
        }
        directionsPanel.classList.remove("hidden");
        directions.forEach((dir, idx) => {
            const li = document.createElement("li");
            li.id = `dir-step-${idx}`;
            li.textContent = dir;
            directionsList.appendChild(li);
        });
    }

    /**
     * Highlight the current direction step during animation.
     */
    function highlightDirection(step) {
        // step 0 = the start position, directions start at step 1
        const dirIdx = step - 1;
        // Remove previous highlights
        directionsList.querySelectorAll(".dir-active").forEach(el => el.classList.remove("dir-active"));
        const el = document.getElementById(`dir-step-${dirIdx}`);
        if (el) {
            el.classList.add("dir-active");
            el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }

    /**
     * Handle clicking a cell in the grid editor.
     */
    function handleCellClick(r, c) {
        if (!activePayload) {
            // If no payload is loaded yet, try to parse current JSON or create a default
            try {
                activePayload = JSON.parse(jsonInput.value);
            } catch (e) {
                showError("Please provide a valid JSON grid base first.");
                return;
            }
        }

        clearAnimation(); // Stop any running path animation

        if (activeTool === "start") {
            // Update start position
            activePayload.start = [r, c];
            // Start cell shouldn't be an obstacle
            activePayload.grid[r][c] = 0;
        } else if (activeTool === "2") {
            // Add/Remove target
            const idx = activePayload.targets.findIndex(t => t[0] === r && t[1] === c);
            if (idx === -1) {
                activePayload.targets.push([r, c]);
                activePayload.grid[r][c] = 2; // target
            } else {
                activePayload.targets.splice(idx, 1);
                activePayload.grid[r][c] = 0; // back to path
            }
        } else {
            // Toggle path/obstacle (tool '0' or '1')
            const val = parseInt(activeTool);
            activePayload.grid[r][c] = val;

            // Remove from targets if it became an obstacle
            if (val === 1) {
                activePayload.targets = activePayload.targets.filter(t => t[0] !== r || t[1] !== c);
            }
        }

        // Re-render and sync back to JSON box
        if (is3DMode) render3DGrid();
        else renderGrid(activePayload.grid, activePayload.start, activePayload.targets, []);
        syncJsonInput();
    }

    /**
     * Sync activePayload back to the JSON textarea.
     */
    function syncJsonInput() {
        if (!activePayload) return;
        jsonInput.value = JSON.stringify(activePayload, null, 2);
    }

    /**
     * Clear all obstacles and targets from the grid.
     */
    function handleClearGrid() {
        if (!activePayload) return;
        clearAnimation();
        const rows = activePayload.grid.length;
        const cols = activePayload.grid[0].length;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                activePayload.grid[r][c] = 0;
            }
        }
        activePayload.targets = [];
        if (is3DMode) render3DGrid();
        else renderGrid(activePayload.grid, activePayload.start, activePayload.targets, []);
        syncJsonInput();
    }

    // ── Three.js (3D View) Logic ────────────────────────────────

    function init3DScene() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x05060a);

        const width = threeContainer.clientWidth;
        const height = threeContainer.clientHeight || 450;

        camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.set(12, 12, 12);
        camera.lookAt(0, 0, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        threeContainer.appendChild(renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        scene.add(directionalLight);

        function animate() {
            if (!is3DMode) return;
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        }
        animate();

        window.addEventListener('resize', () => {
            if (!renderer) return;
            const w = threeContainer.clientWidth;
            const h = threeContainer.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        });
    }

    function render3DGrid() {
        if (!activePayload) return;
        if (gridGroup) scene.remove(gridGroup);
        gridGroup = new THREE.Group();

        const grid = activePayload.grid;
        const rows = grid.length;
        const cols = grid[0].length;
        const start = activePayload.start;
        const targetSet = new Set(activePayload.targets.map(key));

        // Center the grid
        const offsetX = -cols / 2;
        const offsetZ = -rows / 2;

        const boxGeo = new THREE.BoxGeometry(0.9, 0.5, 0.9);
        const planeGeo = new THREE.PlaneGeometry(1, 1);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const isObstacle = grid[r][c] === 1;
                const isTarget = targetSet.has(key([r, c]));
                const isStart = key(start) === key([r, c]);

                let material;
                if (isObstacle) {
                    material = new THREE.MeshPhongMaterial({ color: 0x24273a });
                    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.9), material);
                    cube.position.set(c + offsetX, 0.6, r + offsetZ);
                    gridGroup.add(cube);
                } else {
                    let color = 0x161821;
                    if (isStart) color = 0x2dd4a8;
                    else if (isTarget) color = 0xf7b731;

                    material = new THREE.MeshPhongMaterial({ color: color });
                    const tile = new THREE.Mesh(planeGeo, material);
                    tile.rotation.x = -Math.PI / 2;
                    tile.position.set(c + offsetX, 0, r + offsetZ);
                    gridGroup.add(tile);
                }
            }
        }
        scene.add(gridGroup);

        // Add Picker
        if (pickerMesh) scene.remove(pickerMesh);
        const pickerGeo = new THREE.SphereGeometry(0.35, 16, 16);
        const pickerMat = new THREE.MeshPhongMaterial({ color: 0x6c63ff, emissive: 0x6c63ff, emissiveIntensity: 0.5 });
        pickerMesh = new THREE.Mesh(pickerGeo, pickerMat);
        pickerMesh.position.set(start[1] + offsetX, 0.4, start[0] + offsetZ);
        scene.add(pickerMesh);

        // Reset path meshes
        pathMeshes.forEach(m => scene.remove(m));
        pathMeshes = [];
    }

    function animatePath3D(path, targets) {
        if (!path || path.length === 0) return;
        render3DGrid(); // ensure clean state

        const targetSet = new Set(targets.map(key));
        const offsetX = -activePayload.grid[0].length / 2;
        const offsetZ = -activePayload.grid.length / 2;

        let step = 0;
        animationTimer = setInterval(() => {
            if (step >= path.length) {
                clearInterval(animationTimer);
                animationTimer = null;
                completionBanner.classList.remove("hidden");
                return;
            }

            const [r, c] = path[step];
            pickerMesh.position.set(c + offsetX, 0.4, r + offsetZ);

            // Leave breadcrumb
            const dotGeo = new THREE.SphereGeometry(0.1, 8, 8);
            const dotMat = new THREE.MeshBasicMaterial({ color: 0x6c63ff, transparent: true, opacity: 0.5 });
            const dot = new THREE.Mesh(dotGeo, dotMat);
            dot.position.set(c + offsetX, 0.1, r + offsetZ);
            scene.add(dot);
            pathMeshes.push(dot);

            highlightDirection(step);
            step++;
        }, 150);
    }


    /**
     * Update the Stats Dashboard with backend metrics.
     */
    function updateStatsDashboard(data) {
        const metrics = data.metrics || {};

        // Update simple stats
        const nodesExploredEl = document.getElementById("nodes-explored-value");
        if (nodesExploredEl) nodesExploredEl.textContent = data.nodes_explored;

        const naiveStepsEl = document.getElementById("naive-steps-value");
        if (naiveStepsEl) naiveStepsEl.textContent = metrics.naive_steps || "N/A";

        const efficiencyEl = document.getElementById("efficiency-value");
        if (efficiencyEl) efficiencyEl.textContent = metrics.path_optimization || "100%";

        const timeSavedEl = document.getElementById("time-saved-value");
        if (timeSavedEl) timeSavedEl.textContent = metrics.time_saved_score || "0";
    }

    function resetStats() {
        ["nodes-explored-value", "naive-steps-value", "efficiency-value", "time-saved-value"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = "0";
        });
    }
})();
