/* =========================================================
   ILONCHA 3D (SNAKE) O'YINI — JavaScript + Three.js
   ========================================================= */

   (function () {
    'use strict';
  
    /* ==================== SOZLAMALAR ==================== */
    const GRID_SIZE        = 20;    // Maydon 20 x 20 katak
    const BASE_SPEED       = 150;   // Boshlang'ich qadam vaqti (ms)
    const MIN_SPEED        = 60;    // Maksimal tezlik (ms)
    const SPEED_DECREASE   = 12;    // Har darajada tezlashish (ms)
    const POINTS_PER_FOOD  = 10;    // Bitta olma uchun ball
    const POINTS_PER_LEVEL = 50;    // Necha ballda daraja oshadi
    const MAX_RECORDS      = 5;     // Saqlanadigan rekordlar soni
  
    const KEY_HIGH_SCORE = 'snake_highScore';
    const KEY_RECORDS    = 'snake_records';
  
    // 3D balandliklar
    const BODY_Y = 0.45;
    const HEAD_Y = 0.50;
    const FOOD_Y = 0.50;
  
    const HALF_CELLS = (GRID_SIZE - 1) / 2;
  
    function gridToWorldX(gx) { return gx - HALF_CELLS; }
    function gridToWorldZ(gy) { return gy - HALF_CELLS; }
  
    /* ==================== LOCALSTORAGE QO'RIQCHISI ==================== */
    const storage = {
      get(key, fallback) {
        try {
          const raw = localStorage.getItem(key);
          if (raw === null) return fallback;
          return JSON.parse(raw);
        } catch (err) {
          console.warn("localStorage o'qishda xatolik:", err);
          return fallback;
        }
      },
      set(key, value) {
        try {
          localStorage.setItem(key, JSON.stringify(value));
          return true;
        } catch (err) {
          console.warn("localStorage yozishda xatolik:", err);
          return false;
        }
      },
      remove(key) {
        try { localStorage.removeItem(key); } catch (err) { /* e'tiborsiz */ }
      }
    };
  
    /* ==================== DOM ELEMENTLARI ==================== */
    const canvas = document.getElementById('gameCanvas');
  
    const scoreEl     = document.getElementById('score');
    const highScoreEl = document.getElementById('highScore');
    const levelEl     = document.getElementById('level');
  
    const overlay      = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlayTitle');
    const overlayText  = document.getElementById('overlayText');
  
    const startBtn   = document.getElementById('startBtn');
    const pauseBtn   = document.getElementById('pauseBtn');
    const restartBtn = document.getElementById('restartBtn');
  
    const recordsList     = document.getElementById('recordsList');
    const clearRecordsBtn = document.getElementById('clearRecordsBtn');
  
    const dpadButtons = document.querySelectorAll('[data-dir]');
  
    /* ==================== THREE.JS O'ZGARUVCHILARI ==================== */
    let renderer = null;
    let scene = null;
    let camera = null;
  
    const segmentMeshes = [];
    let foodGroup = null;
  
    let bodyGeometry = null;
    let headGeometry = null;
    let eyeGeometry = null;
    let pupilGeometry = null;
    let eyeWhiteMaterial = null;
    let eyePupilMaterial = null;
    let headMaterial = null;
  
    /* ==================== O'YIN HOLATI ==================== */
    let snake         = [];
    let direction     = { x: 1, y: 0 };
    let nextDirection = { x: 1, y: 0 };
    let food          = { x: 0, y: 0 };
    let score         = 0;
    let level         = 1;
    let stepTime      = BASE_SPEED;
    let gameState     = 'idle';      // idle | running | paused | over
    let accumulator   = 0;
    let lastTimestamp = 0;
    let frameId       = null;
  
    /* =========================================================
       THREE.JS — SAHNA, KAMERA, YORUG'LIK, TAxta
       ========================================================= */
  
    function initThree() {
      // --- Renderer ---
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
      if (THREE.ColorManagement) {
        THREE.ColorManagement.enabled = true;
      }
      if ('outputEncoding' in renderer && THREE.sRGBEncoding !== undefined) {
        renderer.outputEncoding = THREE.sRGBEncoding;
      }
      if (THREE.ACESFilmicToneMapping !== undefined) {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.12;
      }
      renderer.setClearColor(0x0b1120, 1);
  
      // --- Sсena ---
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0b1120);
  
      // --- Kamera (45° burchak ostida yuqoridan) ---
      camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
      camera.position.set(0, 24, 24);
      camera.lookAt(0, 0, 0);
  
      // --- Yorug'lik ---
      scene.add(new THREE.AmbientLight(0xb8c7e0, 0.55));
      scene.add(new THREE.HemisphereLight(0x94a3b8, 0x0f172a, 0.60));
  
      const dirLight = new THREE.DirectionalLight(0xffffff, 1.45);
      dirLight.position.set(9, 20, 12);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width  = 1024;
      dirLight.shadow.mapSize.height = 1024;
      dirLight.shadow.camera.left   = -16;
      dirLight.shadow.camera.right  =  16;
      dirLight.shadow.camera.top    =  16;
      dirLight.shadow.camera.bottom = -16;
      dirLight.shadow.camera.near   = 1;
      dirLight.shadow.camera.far    = 60;
      dirLight.shadow.bias = -0.0007;
      dirLight.shadow.normalBias = 0.02;
      scene.add(dirLight);
  
      const fillLight = new THREE.DirectionalLight(0x4ade80, 0.40);
      fillLight.position.set(-10, 9, -12);
      scene.add(fillLight);
  
      const rimLight = new THREE.PointLight(0x22c55e, 0.45, 70, 2);
      rimLight.position.set(0, 14, 0);
      scene.add(rimLight);
  
      // --- Umumiy geometriya va materiallar ---
      bodyGeometry  = new THREE.SphereGeometry(0.42, 20, 14);
      headGeometry  = new THREE.SphereGeometry(0.46, 24, 18);
      eyeGeometry   = new THREE.SphereGeometry(0.085, 12, 10);
      pupilGeometry = new THREE.SphereGeometry(0.040, 10, 8);
  
      eyeWhiteMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.25, metalness: 0.0
      });
      eyeWhiteMaterial.userData.shared = true;
  
      eyePupilMaterial = new THREE.MeshStandardMaterial({
        color: 0x0b1120, roughness: 0.40, metalness: 0.10
      });
      eyePupilMaterial.userData.shared = true;
  
      headMaterial = new THREE.MeshStandardMaterial({
        color: 0x6ee7a0, roughness: 0.28, metalness: 0.15,
        emissive: 0x22c55e, emissiveIntensity: 0.35
      });
      headMaterial.userData.shared = true;
  
      // --- Taxta va ovqat ---
      createBoard();
      createFood();
  
      // --- Oyna o'lchamiga moslash ---
      window.addEventListener('resize', handleResize);
      if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
        try {
          const ro = new ResizeObserver(handleResize);
          ro.observe(canvas.parentElement);
        } catch (e) { /* e'tiborsiz */ }
      }
      handleResize();
    }
  
    /* ==================== TAxta (BOARD) ==================== */
    function createBoard() {
      const boardSize = GRID_SIZE + 1; // 21
  
      // Asosiy taxta
      const baseGeo = new THREE.BoxGeometry(boardSize, 0.6, boardSize);
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b, roughness: 0.85, metalness: 0.10
      });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = -0.3;
      base.receiveShadow = true;
      scene.add(base);
  
      // Katak chiziqlari
      const grid = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, 0x334155, 0x253247);
      grid.position.y = 0.012;
      if (grid.material) {
        grid.material.opacity = 0.55;
        grid.material.transparent = true;
      }
      scene.add(grid);
  
      // Devorlar
      const wallHeight = 0.85;
      const wallThick  = 0.28;
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a, roughness: 0.35, metalness: 0.55,
        emissive: 0x22c55e, emissiveIntensity: 0.18
      });
  
      const half = boardSize / 2;
      const offset = half + wallThick / 2;
  
      const longGeo = new THREE.BoxGeometry(boardSize + wallThick * 2, wallHeight, wallThick);
      const sideGeo = new THREE.BoxGeometry(wallThick, wallHeight, boardSize + wallThick * 2);
  
      const north = new THREE.Mesh(longGeo, wallMat);
      north.position.set(0, wallHeight / 2, -offset);
      north.receiveShadow = true;
      scene.add(north);
  
      const south = new THREE.Mesh(longGeo, wallMat);
      south.position.set(0, wallHeight / 2, offset);
      south.receiveShadow = true;
      scene.add(south);
  
      const west = new THREE.Mesh(sideGeo, wallMat);
      west.position.set(-offset, wallHeight / 2, 0);
      west.receiveShadow = true;
      scene.add(west);
  
      const east = new THREE.Mesh(sideGeo, wallMat);
      east.position.set(offset, wallHeight / 2, 0);
      east.receiveShadow = true;
      scene.add(east);
    }
  
    /* ==================== OVQAT (OLMA) ==================== */
    function createFood() {
      const group = new THREE.Group();
  
      const appleMat = new THREE.MeshStandardMaterial({
        color: 0xef4444, roughness: 0.25, metalness: 0.15,
        emissive: 0x991b1b, emissiveIntensity: 0.55
      });
      const appleGeo = new THREE.SphereGeometry(0.34, 24, 18);
      const apple = new THREE.Mesh(appleGeo, appleMat);
      apple.castShadow = true;
      apple.receiveShadow = true;
      group.add(apple);
  
      const stemMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.85 });
      const stemGeo = new THREE.CylinderGeometry(0.028, 0.045, 0.20, 8);
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.set(0.02, 0.40, 0);
      stem.rotation.z = 0.22;
      stem.castShadow = true;
      group.add(stem);
  
      const leafMat = new THREE.MeshStandardMaterial({
        color: 0x22c55e, roughness: 0.55, side: THREE.DoubleSide,
        emissive: 0x14532d, emissiveIntensity: 0.30
      });
      const leafGeo = new THREE.SphereGeometry(0.10, 12, 8);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.scale.set(1.5, 0.32, 0.85);
      leaf.position.set(0.16, 0.44, 0);
      leaf.rotation.z = -0.55;
      leaf.castShadow = true;
      group.add(leaf);
  
      group.visible = false;
      group.position.y = FOOD_Y;
      scene.add(group);
      foodGroup = group;
    }
  
    /* ==================== ILON BOSH MESH ==================== */
    function createHeadMesh() {
      const group = new THREE.Group();
  
      const head = new THREE.Mesh(headGeometry, headMaterial);
      head.scale.set(1, 0.94, 1);
      head.castShadow = true;
      head.receiveShadow = true;
      group.add(head);
  
      const eyeL = new THREE.Mesh(eyeGeometry, eyeWhiteMaterial);
      eyeL.position.set(-0.17, 0.14, 0.40);
      group.add(eyeL);
  
      const eyeR = new THREE.Mesh(eyeGeometry, eyeWhiteMaterial);
      eyeR.position.set(0.17, 0.14, 0.40);
      group.add(eyeR);
  
      const pupilL = new THREE.Mesh(pupilGeometry, eyePupilMaterial);
      pupilL.position.set(-0.17, 0.14, 0.465);
      group.add(pupilL);
  
      const pupilR = new THREE.Mesh(pupilGeometry, eyePupilMaterial);
      pupilR.position.set(0.17, 0.14, 0.465);
      group.add(pupilR);
  
      return group;
    }
  
    /* ==================== ILON TANA MESH ==================== */
    function createBodyMesh() {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x4ade80, roughness: 0.32, metalness: 0.15,
        emissive: 0x16a34a, emissiveIntensity: 0.20
      });
      const mesh = new THREE.Mesh(bodyGeometry, mat);
      mesh.scale.set(1, 0.9, 1);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }
  
    /* ==================== MESHNI TOZALASH ==================== */
    function disposeMesh(obj) {
      obj.traverse(function (child) {
        if (child.isMesh) {
          if (child.material && !child.material.userData.shared) {
            child.material.dispose();
          }
          // Geometriya umumiy — dispose qilmaymiz
        }
      });
    }
  
    /* ==================== OYNA O'LCHAMI ==================== */
    function handleResize() {
      if (!renderer || !camera || !canvas.parentElement) return;
      const container = canvas.parentElement;
      const width  = Math.max(1, Math.floor(container.clientWidth));
      const height = Math.max(1, Math.floor(container.clientHeight));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  
    /* =========================================================
       LOCALSTORAGE — REKORDLAR
       ========================================================= */
  
    function getHighScore() {
      const value = Number(storage.get(KEY_HIGH_SCORE, 0));
      return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    }
  
    function getRecords() {
      const data = storage.get(KEY_RECORDS, []);
      if (!Array.isArray(data)) return [];
      return data
        .filter(function (item) {
          return item && typeof item.score === 'number' && isFinite(item.score);
        })
        .map(function (item) {
          return { score: item.score, date: item.date || null };
        });
    }
  
    function renderRecords() {
      const records = getRecords();
      recordsList.innerHTML = '';
  
      if (records.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = "Hozircha natijalar yo'q";
        recordsList.appendChild(empty);
        return;
      }
  
      records.forEach(function (record, index) {
        const li = document.createElement('li');
  
        const rank = document.createElement('span');
        rank.className = 'rank';
        rank.textContent = String(index + 1);
  
        const scoreSpan = document.createElement('span');
        scoreSpan.className = 'rec-score';
        scoreSpan.textContent = record.score + ' ball';
  
        const dateSpan = document.createElement('span');
        dateSpan.className = 'rec-date';
        if (record.date) {
          const d = new Date(record.date);
          dateSpan.textContent = isNaN(d.getTime())
            ? ''
            : d.toLocaleDateString('uz-UZ');
        }
  
        li.appendChild(rank);
        li.appendChild(scoreSpan);
        li.appendChild(dateSpan);
        recordsList.appendChild(li);
      });
    }
  
    function saveResult(finalScore) {
      if (finalScore > getHighScore()) {
        storage.set(KEY_HIGH_SCORE, finalScore);
      }
  
      if (finalScore > 0) {
        const records = getRecords();
        records.push({ score: finalScore, date: new Date().toISOString() });
        records.sort(function (a, b) { return b.score - a.score; });
        storage.set(KEY_RECORDS, records.slice(0, MAX_RECORDS));
      }
  
      updateHighScoreDisplay();
      renderRecords();
    }
  
    function updateHighScoreDisplay() {
      highScoreEl.textContent = String(getHighScore());
    }
  
    /* =========================================================
       MESH SINXRONIZATSIYASI
       ========================================================= */
  
    function syncSnakeMeshes() {
      // Yangi segmentlar uchun mesh yaratish
      while (segmentMeshes.length < snake.length) {
        const index = segmentMeshes.length;
        const mesh = (index === 0) ? createHeadMesh() : createBodyMesh();
        const seg = snake[index];
  
        mesh.position.set(
          gridToWorldX(seg.x),
          index === 0 ? HEAD_Y : BODY_Y,
          gridToWorldZ(seg.y)
        );
        mesh.userData.targetX = mesh.position.x;
        mesh.userData.targetZ = mesh.position.z;
  
        if (index === 0) {
          mesh.rotation.y = Math.atan2(direction.x, direction.y);
        }
  
        scene.add(mesh);
        segmentMeshes.push(mesh);
      }
  
      // Ortiqcha meshlarni olib tashlash
      while (segmentMeshes.length > snake.length) {
        const m = segmentMeshes.pop();
        scene.remove(m);
        disposeMesh(m);
      }
  
      // Maqsad pozitsiyalarni yangilash
      for (let i = 0; i < snake.length; i++) {
        const mesh = segmentMeshes[i];
        const seg = snake[i];
        mesh.userData.targetX = gridToWorldX(seg.x);
        mesh.userData.targetZ = gridToWorldZ(seg.y);
      }
    }
  
    function snapMeshes() {
      for (let i = 0; i < segmentMeshes.length && i < snake.length; i++) {
        const seg = snake[i];
        const m = segmentMeshes[i];
        const isHead = (i === 0);
  
        m.position.set(
          gridToWorldX(seg.x),
          isHead ? HEAD_Y : BODY_Y,
          gridToWorldZ(seg.y)
        );
        m.userData.targetX = m.position.x;
        m.userData.targetZ = m.position.z;
  
        if (isHead) {
          m.rotation.y = Math.atan2(direction.x, direction.y);
        }
      }
    }
  
    /* =========================================================
       O'YINNI SOZLASH
       ========================================================= */
  
    function resetGame() {
      snake = [
        { x: 9,  y: 10 },
        { x: 8,  y: 10 },
        { x: 7,  y: 10 }
      ];
      direction     = { x: 1, y: 0 };
      nextDirection = { x: 1, y: 0 };
  
      score    = 0;
      level    = 1;
      stepTime = BASE_SPEED;
      accumulator = 0;
  
      scoreEl.textContent = '0';
      levelEl.textContent = '1';
      updateHighScoreDisplay();
  
      syncSnakeMeshes();
      snapMeshes();
      spawnFood();
    }
  
    function spawnFood() {
      const freeCells = [];
  
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let y = 0; y < GRID_SIZE; y++) {
          const occupied = snake.some(function (seg) {
            return seg.x === x && seg.y === y;
          });
          if (!occupied) freeCells.push({ x: x, y: y });
        }
      }
  
      if (freeCells.length === 0) {
        food = { x: -1, y: -1 };
        if (foodGroup) foodGroup.visible = false;
        return;
      }
  
      food = freeCells[Math.floor(Math.random() * freeCells.length)];
  
      if (foodGroup) {
        foodGroup.visible = true;
        foodGroup.position.set(
          gridToWorldX(food.x),
          FOOD_Y,
          gridToWorldZ(food.y)
        );
      }
    }
  
    /* =========================================================
       O'YINNI BOSHQARISH
       ========================================================= */
  
    function startGame() {
      resetGame();
      gameState = 'running';
      hideOverlay();
      pauseBtn.textContent = '⏸ Pauza';
      lastTimestamp = performance.now();
      accumulator = 0;
    }
  
    function togglePause() {
      if (gameState === 'running') {
        gameState = 'paused';
        pauseBtn.textContent = '▶ Davom';
        showOverlay(
          '⏸ Pauza',
          "Davom ettirish uchun tugmani yoki Space'ni bosing",
          'Davom ettirish'
        );
      } else if (gameState === 'paused') {
        gameState = 'running';
        hideOverlay();
        pauseBtn.textContent = '⏸ Pauza';
        accumulator = 0;
        lastTimestamp = performance.now();
      }
    }
  
    function endGame(isWin) {
      gameState = 'over';
  
      const previousHigh = getHighScore();
      const isNewRecord  = score > previousHigh && score > 0;
  
      saveResult(score);
  
      const title = isWin ? "🎉 G'alaba!" : "💀 O'yin tugadi";
      let text = 'Sizning hisobingiz: ' + score + ' ball';
      if (isNewRecord) {
        text += '  —  Yangi rekord! 🏆';
      } else if (score > 0) {
        text += '  (rekord: ' + getHighScore() + ')';
      }
  
      showOverlay(title, text, 'Qaytadan boshlash');
      pauseBtn.textContent = '⏸ Pauza';
    }
  
    /* =========================================================
       OVERLAY
       ========================================================= */
  
    function showOverlay(title, text, buttonLabel) {
      overlayTitle.textContent = title;
      overlayText.textContent  = text;
      startBtn.textContent     = buttonLabel;
      overlay.classList.remove('hidden');
    }
  
    function hideOverlay() {
      overlay.classList.add('hidden');
    }
  
    /* =========================================================
       YO'NALISH
       ========================================================= */
  
    function setDirection(x, y) {
      if (gameState !== 'running') return;
      if (direction.x === -x && direction.y === -y) return;
      if (direction.x === x && direction.y === y) return;
      nextDirection = { x: x, y: y };
    }
  
    /* =========================================================
       ANIMATSIYA LOOPI
       ========================================================= */
  
    function animationLoop(timestamp) {
      frameId = requestAnimationFrame(animationLoop);
  
      let delta = timestamp - lastTimestamp;
      lastTimestamp = timestamp;
      if (delta > 100) delta = 100;
      if (delta < 0)   delta = 0;
  
      if (gameState === 'running') {
        accumulator += delta;
        while (accumulator >= stepTime) {
          accumulator -= stepTime;
          update();
          if (gameState !== 'running') {
            accumulator = 0;
            break;
          }
        }
      } else {
        accumulator = 0;
      }
  
      updateAnimations(timestamp, delta);
      renderer.render(scene, camera);
    }
  
    /* ==================== LOGIKA YANGILANISHI ==================== */
    function update() {
      direction = { x: nextDirection.x, y: nextDirection.y };
  
      const head = {
        x: snake[0].x + direction.x,
        y: snake[0].y + direction.y
      };
  
      // 1) Devorga urilish
      if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
        endGame(false);
        return;
      }
  
      const willEat = (head.x === food.x && head.y === food.y);
  
      // 2) O'z tanasiga urilish
      const body = willEat ? snake : snake.slice(0, snake.length - 1);
      const hitSelf = body.some(function (seg) {
        return seg.x === head.x && seg.y === head.y;
      });
  
      if (hitSelf) {
        endGame(false);
        return;
      }
  
      // 3) Harakat
      snake.unshift(head);
  
      if (willEat) {
        score += POINTS_PER_FOOD;
        scoreEl.textContent = String(score);
        updateLevel();
        spawnFood();
  
        if (food.x === -1 && food.y === -1) {
          syncSnakeMeshes();
          endGame(true);
          return;
        }
      } else {
        snake.pop();
      }
  
      syncSnakeMeshes();
    }
  
    function updateLevel() {
      const newLevel = Math.floor(score / POINTS_PER_LEVEL) + 1;
      if (newLevel !== level) {
        level = newLevel;
        levelEl.textContent = String(level);
        stepTime = Math.max(MIN_SPEED, BASE_SPEED - (level - 1) * SPEED_DECREASE);
      }
    }
  
    /* ==================== ANIMATSIYALAR ==================== */
    function updateAnimations(timestamp, delta) {
      const posLerp = 1 - Math.exp(-delta * 0.022);
      const rotLerp = 1 - Math.exp(-delta * 0.018);
  
      // Pozitsiyalarni silliq lerp qilish
      for (let i = 0; i < segmentMeshes.length; i++) {
        const m = segmentMeshes[i];
        if (m.userData.targetX !== undefined) {
          m.position.x += (m.userData.targetX - m.position.x) * posLerp;
          m.position.z += (m.userData.targetZ - m.position.z) * posLerp;
        }
      }
  
      // Bosh aylanishi
      if (segmentMeshes.length > 0) {
        const head = segmentMeshes[0];
        const targetRot = Math.atan2(direction.x, direction.y);
        head.rotation.y = lerpAngle(head.rotation.y, targetRot, rotLerp);
      }
  
      // Tana ranglari va o'lchamlari (gradient)
      const total = segmentMeshes.length;
      for (let i = 1; i < total; i++) {
        const m = segmentMeshes[i];
        const t = (total <= 2) ? 0 : (i - 1) / (total - 2);
  
        const hue   = 0.36 - t * 0.10;
        const sat   = 0.62 - t * 0.08;
        const light = 0.55 - t * 0.16;
  
        if (m.material && m.material.color) {
          m.material.color.setHSL(hue, sat, light);
          if (m.material.emissive) {
            m.material.emissive.setHSL(hue, 0.75, 0.10);
          }
        }
  
        const s = 1 - t * 0.22;
        m.scale.set(s, s * 0.9, s);
      }
  
      // Ovqat animatsiyasi
      if (foodGroup && foodGroup.visible) {
        foodGroup.rotation.y += delta * 0.0022;
        foodGroup.position.y = FOOD_Y + Math.sin(timestamp * 0.0032) * 0.09;
  
        const pulse = 1 + Math.sin(timestamp * 0.005) * 0.04;
        foodGroup.scale.setScalar(pulse);
      }
    }
  
    function lerpAngle(a, b, t) {
      let diff = b - a;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      return a + diff * t;
    }
  
    /* =========================================================
       KLAVIATURA
       ========================================================= */
  
    function handleKeyDown(event) {
      const code = event.code;
  
      switch (code) {
        case 'ArrowUp':
        case 'KeyW':
          setDirection(0, -1);
          event.preventDefault();
          break;
  
        case 'ArrowDown':
        case 'KeyS':
          setDirection(0, 1);
          event.preventDefault();
          break;
  
        case 'ArrowLeft':
        case 'KeyA':
          setDirection(-1, 0);
          event.preventDefault();
          break;
  
        case 'ArrowRight':
        case 'KeyD':
          setDirection(1, 0);
          event.preventDefault();
          break;
  
        case 'Space':
        case 'KeyP':
          if (gameState === 'running' || gameState === 'paused') {
            togglePause();
          }
          event.preventDefault();
          break;
  
        case 'Enter':
          if (gameState === 'paused') {
            togglePause();
          } else if (gameState === 'idle' || gameState === 'over') {
            startGame();
          }
          event.preventDefault();
          break;
  
        default:
          break;
      }
    }
  
    /* =========================================================
       TOUCH (SWIPE)
       ========================================================= */
  
    let touchStart = null;
  
    function handleTouchStart(event) {
      const touch = event.changedTouches[0];
      touchStart = { x: touch.clientX, y: touch.clientY };
    }
  
    function handleTouchEnd(event) {
      if (!touchStart) return;
  
      const touch = event.changedTouches[0];
      const dx = touch.clientX - touchStart.x;
      const dy = touch.clientY - touchStart.y;
      touchStart = null;
  
      const threshold = 24;
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
  
      if (Math.abs(dx) > Math.abs(dy)) {
        setDirection(dx > 0 ? 1 : -1, 0);
      } else {
        setDirection(0, dy > 0 ? 1 : -1);
      }
    }
  
    /* =========================================================
       HODISALARNI BOG'LASH
       ========================================================= */
  
    function bindEvents() {
      document.addEventListener('keydown', handleKeyDown);
  
      startBtn.addEventListener('click', function () {
        if (gameState === 'paused') {
          togglePause();
        } else {
          startGame();
        }
      });
  
      pauseBtn.addEventListener('click', function () {
        if (gameState === 'running' || gameState === 'paused') {
          togglePause();
        }
      });
  
      restartBtn.addEventListener('click', function () {
        startGame();
      });
  
      clearRecordsBtn.addEventListener('click', function () {
        const confirmed = window.confirm("Barcha natijalar va rekord o'chirilsinmi?");
        if (!confirmed) return;
  
        storage.remove(KEY_HIGH_SCORE);
        storage.remove(KEY_RECORDS);
        updateHighScoreDisplay();
        renderRecords();
      });
  
      // Mobil D-Pad
      dpadButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          const dir = btn.getAttribute('data-dir');
          if (dir === 'up')    setDirection(0, -1);
          if (dir === 'down')  setDirection(0, 1);
          if (dir === 'left')  setDirection(-1, 0);
          if (dir === 'right') setDirection(1, 0);
        });
      });
  
      // Swipe
      canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
      canvas.addEventListener('touchend',   handleTouchEnd,   { passive: true });
  
      // Tab almashganda avtomatik pauza
      document.addEventListener('visibilitychange', function () {
        if (document.hidden && gameState === 'running') {
          togglePause();
        }
      });
    }
  
    /* =========================================================
       ISHGA TUSHIRISH
       ========================================================= */
  
    function init() {
      initThree();
      resetGame();
      renderRecords();
      updateHighScoreDisplay();
      bindEvents();
  
      showOverlay(
        '🐍 Iloncha 3D',
        "Boshlash uchun tugmani bosing. Boshqarish: ↑ ↓ ← → yoki W A S D",
        'Boshlash'
      );
  
      lastTimestamp = performance.now();
      frameId = requestAnimationFrame(animationLoop);
    }
  
    /* ==================== THREE.JS MAVJUDLIGINI TEKSHIRISH ==================== */
    if (typeof THREE === 'undefined') {
      overlayTitle.textContent = '⚠️ Xatolik';
      overlayText.textContent  = "Three.js kutubxonasi yuklanmadi. Internet aloqasini tekshiring va sahifani yangilang.";
      startBtn.style.display   = 'none';
      return;
    }
  
    init();
  
  })();