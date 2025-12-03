
        // --- System Setup ---
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d', { alpha: false }); // Optimize
        const menuCanvas = document.getElementById('menuCarCanvas');
        const menuCtx = menuCanvas.getContext('2d');
        
        // UI Elements
        const scoreEl = document.getElementById('scoreEl');
        const livesEl = document.getElementById('livesEl');
        const modeEl = document.getElementById('modeEl');
        const menuScreen = document.getElementById('menuScreen');
        const startBtn = document.getElementById('startBtn');
        const warningBorder = document.getElementById('warning-border');
        const glitchOverlay = document.getElementById('glitch-overlay');

        let W, H;
        function resize() {
            W = canvas.width = window.innerWidth;
            H = canvas.height = window.innerHeight;
            // Sharp pixels
            ctx.imageSmoothingEnabled = false; 
        }
        window.addEventListener('resize', resize);
        resize();

        // --- Colors & Assets ---
        const C = {
            pMain: '#00f0ff',
            pDark: '#008c99',
            pAccent: '#ff00aa',
            road: '#1a1a24',
            roadLine: '#3d3d4f',
            grass: '#050508',
            grid: 'rgba(0, 240, 255, 0.1)',
            enemy: '#ff3333',
            enemyDark: '#990000'
        };

        // --- State Management ---
        const MODES = {
            ISOMETRIC: 0, // Diagonal Top-Down
            SIDE: 1,      // Side Scroller
            REAR: 2       // Outrun 3D
        };

        let state = {
            active: false,
            menu: true,
            mode: MODES.ISOMETRIC,
            score: 0,
            lives: 100,
            frame: 0,
            speed: 0,
            roadW: 300,
            offRoad: 0,
            nextSwitch: 500
        };

        const keys = { ArrowUp:false, ArrowDown:false, ArrowLeft:false, ArrowRight:false, w:false, a:false, s:false, d:false };
        
        let player = { x: 0, y: 0, z: 0, w: 0, h: 0, vx: 0, vy: 0, tilt: 0 };
        let entities = [];
        let particles = [];

        // --- Audio (Synthesized) ---
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        function playTone(freq, type, dur, vol=0.1) {
            if(audioCtx.state === 'suspended') audioCtx.resume();
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = type;
            o.frequency.setValueAtTime(freq, audioCtx.currentTime);
            g.gain.setValueAtTime(vol, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
            o.connect(g); g.connect(audioCtx.destination);
            o.start(); o.stop(audioCtx.currentTime + dur);
        }

        // --- Helper Functions ---
        function rand(min, max) { return Math.random() * (max - min) + min; }
        
        function spawnExplosion(x, y, color) {
            playTone(100, 'sawtooth', 0.4, 0.3);
            for(let i=0; i<15; i++) {
                particles.push({
                    x, y, color,
                    vx: rand(-10, 10), vy: rand(-10, 10),
                    life: 1, size: rand(2, 6)
                });
            }
        }

        function checkRoad(isValid) {
            if (!isValid) {
                state.offRoad++;
                warningBorder.style.boxShadow = `inset 0 0 0 10px rgba(255, 0, 0, ${Math.min(1, state.offRoad/20)})`;
                
                if (state.offRoad % 5 === 0) {
                    state.lives -= 1;
                    updateLives();
                    playTone(50, 'square', 0.1, 0.05);
                }
                if(state.offRoad > 10 && state.offRoad % 10 === 0) {
                    // Shake effect
                    const shake = 5;
                    canvas.style.transform = `translate(${rand(-shake,shake)}px, ${rand(-shake,shake)}px)`;
                }
            } else {
                state.offRoad = Math.max(0, state.offRoad - 2);
                warningBorder.style.boxShadow = 'inset 0 0 0 0px red';
                canvas.style.transform = 'none';
            }
            if(state.lives <= 0) gameOver();
        }

        function updateLives() {
            const bars = Math.ceil(state.lives / 33); // 3 bars for 100 life
            livesEl.innerText = "█".repeat(bars).padEnd(3, "░");
            if(state.lives < 30) livesEl.style.color = 'red';
            else livesEl.style.color = '#00f0ff';
        }

        // --- MENU 3D CAR RENDERER (True 3D rotation) ---
        let menuAngle = 0;
        function animateMenuCar() {
            if(!state.menu) return;
            menuCtx.clearRect(0, 0, 400, 400);
            menuAngle += 0.015;

            const cx = 200, cy = 200;
            const scale = 1.5;

            // Car Vertices (Simplified Low Poly Cyber Car)
            // Format: x, y, z (y is up/down)
            const verts = [
                // Chassis Bottom
                [-40, 10, -60], [40, 10, -60], [40, 10, 60], [-40, 10, 60],
                // Chassis Mid
                [-45, 0, -65], [45, 0, -65], [45, 0, 65], [-45, 0, 65],
                // Hood/Trunk Deck
                [-40, -15, -60], [40, -15, -60], [40, -10, 60], [-40, -10, 60],
                // Roof
                [-30, -35, -20], [30, -35, -20], [30, -35, 30], [-30, -35, 30]
            ];

            // Rotate & Project
            const projected = verts.map(v => {
                // Rotate Y
                let x = v[0] * Math.cos(menuAngle) - v[2] * Math.sin(menuAngle);
                let z = v[0] * Math.sin(menuAngle) + v[2] * Math.cos(menuAngle);
                let y = v[1];

                // Rotate X (Tilt slightly to see top)
                let y2 = y * Math.cos(0.3) - z * Math.sin(0.3);
                let z2 = y * Math.sin(0.3) + z * Math.cos(0.3);

                // Perspective
                let fov = 400;
                let s = fov / (fov + z2);
                return { x: cx + x * s * scale, y: cy + y2 * s * scale };
            });

            // Draw Faces (Painter's Algo ignored for wireframe style)
            menuCtx.strokeStyle = '#00f0ff';
            menuCtx.lineWidth = 2;
            menuCtx.lineCap = 'round';
            menuCtx.lineJoin = 'round';

            function connect(i, j) {
                menuCtx.beginPath();
                menuCtx.moveTo(projected[i].x, projected[i].y);
                menuCtx.lineTo(projected[j].x, projected[j].y);
                menuCtx.stroke();
            }

            // Connections manually defined for the car shape
            // Bottom Loop
            connect(0,1); connect(1,2); connect(2,3); connect(3,0);
            // Mid Loop
            connect(4,5); connect(5,6); connect(6,7); connect(7,4);
            // Deck Loop
            connect(8,9); connect(9,10); connect(10,11); connect(11,8);
            // Roof Loop
            connect(12,13); connect(13,14); connect(14,15); connect(15,12);

            // Vertical Pillars
            connect(0,4); connect(1,5); connect(2,6); connect(3,7); // Bot to Mid
            connect(4,8); connect(5,9); connect(6,10); connect(7,11); // Mid to Deck
            
            // Roof Pillars
            connect(8,12); connect(9,13); connect(10,14); connect(11,15);

            // Glow
            menuCtx.shadowBlur = 10;
            menuCtx.shadowColor = '#00f0ff';
            menuCtx.stroke();
            menuCtx.shadowBlur = 0;

            requestAnimationFrame(animateMenuCar);
        }
        requestAnimationFrame(animateMenuCar);


        // ============================================================
        // === MODE 0: ISOMETRIC RPG (Diagonal) ===
        // ============================================================
        function initIso() {
            player = { x: 0, y: 0, speed: 12, tilt: 0 }; // x is lateral offset from road center
            entities = [];
            state.roadW = 240;
            modeEl.innerText = "ISOMETRIC PROTOCOL";
        }

        function updateIso() {
            // Controls: Left/Right moves perpendicular to road
            let dx = 0;
            if (keys.ArrowLeft || keys.a) dx = -1;
            if (keys.ArrowRight || keys.d) dx = 1;
            
            // Smooth movement
            player.x += dx * 10;
            player.tilt = dx * 15;

            // Road Check
            const maxDist = state.roadW / 2;
            checkRoad(Math.abs(player.x) < maxDist - 20);

            // Spawn Logic
            if (state.frame % 40 === 0) {
                entities.push({
                    offset: rand(-state.roadW/2 + 30, state.roadW/2 - 30),
                    y: -H, // Start above screen (in rotated coords)
                    type: 'enemy',
                    speed: rand(8, 15)
                });
            }

            // Update Entities (They move "down" the road relative to player)
            for (let i = entities.length - 1; i >= 0; i--) {
                let e = entities[i];
                e.y += player.speed - 4; // Relative speed

                // Collision (Simple Box)
                if (Math.abs(e.y) < 60 && Math.abs(e.offset - player.x) < 50) {
                    spawnExplosion(W/2 + (player.x - e.offset), H/2, '#ff0000');
                    state.lives -= 20;
                    updateLives();
                    entities.splice(i, 1);
                    canvas.classList.add('shake');
                    setTimeout(()=>canvas.classList.remove('shake'), 200);
                }
                
                if (e.y > H) entities.splice(i, 1);
            }
        }

        function drawIso() {
            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, W, H);

            // Grid Background
            ctx.strokeStyle = 'rgba(40,40,60,0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            const gridSize = 60;
            const offset = (state.frame * player.speed) % gridSize;
            
            // We will draw the world rotated 45 degrees
            ctx.save();
            ctx.translate(W/2, H/2);
            ctx.rotate(-Math.PI / 4); // 45 deg Rotation

            // Draw Scrolling Floor Grid
            for(let i = -W; i < W; i+=gridSize) {
                ctx.moveTo(i, -H); ctx.lineTo(i, H); // Vertical lines
            }
            for(let i = -H; i < H; i+=gridSize) {
                ctx.moveTo(-W, i + offset); ctx.lineTo(W, i + offset); // Moving Horizontal
            }
            ctx.stroke();

            // Draw Road (Vertical in this rotated space)
            const rw = state.roadW;
            ctx.fillStyle = '#151515';
            ctx.fillRect(-rw/2, -H, rw, H*2); // Infinite Road

            // Road Borders
            ctx.fillStyle = '#ff00aa';
            ctx.fillRect(-rw/2 - 10, -H, 10, H*2);
            ctx.fillRect(rw/2, -H, 10, H*2);
            
            // Dashed Lines
            ctx.fillStyle = 'white';
            for(let y = -H; y < H; y += 100) {
                ctx.fillRect(-5, y + offset, 10, 40);
            }

            // Enemies
            entities.forEach(e => {
                drawIsoCar(e.offset, e.y, C.enemy, 0);
            });

            // Player (Fixed at center of rotated space)
            drawIsoCar(player.x, 0, C.pMain, player.tilt);

            ctx.restore();
        }

        function drawIsoCar(x, y, color, tilt) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(tilt * 0.02); // Lean into turn

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(-20, -20, 40, 60);

            // 3D Block effect
            // Base
            ctx.fillStyle = color === C.pMain ? C.pDark : C.enemyDark;
            ctx.fillRect(-22, -32, 44, 64);
            
            // Top
            ctx.fillStyle = color;
            ctx.fillRect(-20, -30, 40, 60);

            // Windshield
            ctx.fillStyle = '#111';
            ctx.fillRect(-15, -20, 30, 15); // Front
            ctx.fillRect(-15, 10, 30, 10);  // Rear

            // Roof
            ctx.fillStyle = color;
            ctx.fillRect(-18, -5, 36, 15);

            // Lights
            if (color === C.pMain) {
                ctx.fillStyle = '#ff00aa'; // Rear lights
                ctx.fillRect(-18, 28, 10, 4);
                ctx.fillRect(8, 28, 10, 4);
            } else {
                ctx.fillStyle = '#ffff00'; // Front lights (enemy faces up?) 
                // Actually enemies move down, so we see their rear usually? 
                // Let's say they are oncoming traffic for drama -> Headlights
                ctx.fillStyle = '#fff';
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#fff';
                ctx.fillRect(-18, 28, 10, 4);
                ctx.fillRect(8, 28, 10, 4);
                ctx.shadowBlur = 0;
            }

            ctx.restore();
        }


        // ============================================================
        // === MODE 1: SIDE SCROLLER (Cyber Platformer) ===
        // ============================================================
        function initSide() {
            player = { x: 150, y: H-200, vy: 0, w: 100, h: 40, grounded: true };
            entities = [];
            state.speed = 12;
            modeEl.innerText = "CYBER-CITY FLIGHT";
        }

        function updateSide() {
            const groundY = H - 150;
            
            // Jump
            if ((keys.ArrowUp || keys.w || keys.ArrowLeft) && player.grounded) {
                player.vy = -20;
                player.grounded = false;
                playTone(300, 'sine', 0.2);
            }
            
            player.vy += 1.2; // Gravity
            player.y += player.vy;

            // Floor collision
            if (player.y > groundY) {
                player.y = groundY;
                player.vy = 0;
                player.grounded = true;
            }

            // Check Road (Ceiling is death limit)
            checkRoad(player.y > 50);

            // Spawning (Ground obstacles or Air drones)
            if (state.frame % 60 === 0) {
                let isAir = Math.random() > 0.6;
                entities.push({
                    x: W + 100,
                    y: isAir ? groundY - 120 : groundY,
                    w: isAir ? 60 : 50,
                    h: isAir ? 40 : 60,
                    type: isAir ? 'drone' : 'block'
                });
            }

            // Entity Logic
            for (let i = entities.length - 1; i >= 0; i--) {
                let e = entities[i];
                e.x -= state.speed;

                // AABB Collision
                if (player.x < e.x + e.w && player.x + player.w > e.x &&
                    player.y < e.y + e.h && player.y + player.h > e.y) {
                    
                    spawnExplosion(player.x + 50, player.y, '#ff0000');
                    state.lives -= 25;
                    updateLives();
                    entities.splice(i, 1);
                }

                if (e.x < -200) entities.splice(i, 1);
            }
        }

        function drawSide() {
            // Parallax City Background
            ctx.fillStyle = '#050510';
            ctx.fillRect(0, 0, W, H);

            // Stars
            ctx.fillStyle = '#fff';
            for(let i=0; i<50; i++) {
                let x = (i * 137 + state.frame) % W;
                let y = (i * 43) % (H/2);
                ctx.fillRect(x, y, 2, 2);
            }

            // Buildings (Far)
            ctx.fillStyle = '#111';
            for(let x = 0; x < W; x += 80) {
                let h = 150 + Math.sin(x)*50;
                let px = (x - state.frame * 2) % (W + 100);
                if (px < -100) px += W + 100;
                ctx.fillRect(px, H - 150 - h, 80, h);
            }

            // Road
            const groundY = H - 150;
            ctx.fillStyle = '#222';
            ctx.fillRect(0, groundY + 40, W, H);
            ctx.fillStyle = '#00f0ff';
            ctx.fillRect(0, groundY + 40, W, 4); // Neon Line

            // Entities
            entities.forEach(e => {
                if (e.type === 'drone') {
                    ctx.fillStyle = '#ff0055';
                    ctx.beginPath();
                    ctx.arc(e.x + e.w/2, e.y + e.h/2, 20, 0, Math.PI*2);
                    ctx.fill();
                    ctx.fillStyle = 'white'; // Eye
                    ctx.fillRect(e.x + 10, e.y + 15, 10, 10);
                } else {
                    // Ground Block
                    ctx.fillStyle = '#ff9900';
                    ctx.fillRect(e.x, e.y, e.w, e.h);
                    ctx.strokeStyle = '#fff';
                    ctx.strokeRect(e.x, e.y, e.w, e.h);
                }
            });

            // Player Car (Side Profile)
            ctx.save();
            ctx.translate(player.x, player.y + 10);
            
            // Body
            ctx.fillStyle = C.pMain;
            ctx.beginPath();
            ctx.moveTo(0, 30);
            ctx.lineTo(20, 10); // Rear
            ctx.lineTo(50, 0);  // Roof
            ctx.lineTo(80, 10); // Windshield
            ctx.lineTo(100, 25); // Nose
            ctx.lineTo(95, 35); // Bumper
            ctx.lineTo(0, 35);
            ctx.fill();

            // Underglow
            ctx.shadowBlur = 20;
            ctx.shadowColor = C.pMain;
            ctx.fillStyle = C.pAccent;
            ctx.fillRect(10, 32, 80, 3);
            ctx.shadowBlur = 0;

            // Wheels
            ctx.fillStyle = '#111';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            
            ctx.beginPath(); ctx.arc(25, 35, 12, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.arc(80, 35, 12, 0, Math.PI*2); ctx.fill(); ctx.stroke();

            ctx.restore();
        }


        // ============================================================
        // === MODE 2: REAR VIEW (Outrun Style Redesign) ===
        // ============================================================
        function initRear() {
            player = { x: 0, z: 0, speed: 0, tilt: 0 }; // x is -1 to 1 on road
            entities = [];
            state.speed = 600; 
            modeEl.innerText = "OUTRUN HORIZON";
        }

        function updateRear() {
            // Input handling
            let dx = 0;
            if (keys.ArrowLeft || keys.a) dx = -0.06;
            if (keys.ArrowRight || keys.d) dx = 0.06;
            
            player.x += dx;
            // Smooth tilt for player car
            player.tilt = player.tilt * 0.8 + (dx * 8); 

            // Road bounds (Road is roughly -1.0 to 1.0)
            checkRoad(Math.abs(player.x) < 1.1);

            // Spawning
            if (state.frame % 25 === 0) {
                entities.push({
                    x: rand(-0.9, 0.9), // Keep on road
                    z: 3000, // Start further back
                    color: rand(0,1) > 0.5 ? '#ff0055' : '#ffff00'
                });
            }

            // Update Entities
            for (let i = entities.length - 1; i >= 0; i--) {
                let e = entities[i];
                e.z -= 30; // Speed of approach

                // Collision check
                // Z range: needs to be very close to 0 (the camera plane)
                // X range: Hitbox needs to be narrow enough to allow passing
                if (e.z < 200 && e.z > -100) {
                    // Collision Box: Player width is approx 0.3 units in this space
                    if (Math.abs(player.x - e.x) < 0.25) {
                        spawnExplosion(W/2, H - 100, '#ff0000');
                        state.lives -= 20;
                        updateLives();
                        entities.splice(i, 1);
                    }
                }
                if (e.z < -300) entities.splice(i, 1);
            }
        }

        // Helper to draw a 3D-ish car from behind
        function drawOutrunCar(ctx, x, y, scale, color, tilt = 0) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(tilt);
            ctx.scale(scale, scale);

            // Dimensions (Unscaled)
            const w = 240;
            const h = 100;

            // 1. Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(-w/2 + 10, h/4, w - 20, 20);

            // 2. Tires (Exposed wide tires)
            ctx.fillStyle = '#111';
            ctx.fillRect(-w/2 - 10, h/4 - 20, 40, 40); // Left
            ctx.fillRect(w/2 - 30, h/4 - 20, 40, 40);  // Right

            // 3. Main Chassis (Bottom)
            ctx.fillStyle = color; // Base
            // Draw a chamfered box
            ctx.beginPath();
            ctx.moveTo(-w/2, 0);
            ctx.lineTo(w/2, 0);
            ctx.lineTo(w/2 - 10, h/2);
            ctx.lineTo(-w/2 + 10, h/2);
            ctx.fill();
            
            // Darker side for shading
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(-w/2, 0, w, 10); 

            // 4. Cabin (Top)
            ctx.fillStyle = '#000'; // Glass/Dark
            ctx.beginPath();
            ctx.moveTo(-w/4 - 10, 0);
            ctx.lineTo(w/4 + 10, 0);
            ctx.lineTo(w/4 - 5, -h/2);
            ctx.lineTo(-w/4 + 5, -h/2);
            ctx.fill();

            // Roof top
            ctx.fillStyle = color;
            ctx.fillRect(-w/4 + 5, -h/2 - 5, (w/4 - 5)*2, 5);

            // 5. Lights
            // Tail light strip
            ctx.fillStyle = '#300';
            ctx.fillRect(-w/2 + 20, 5, w - 40, 15);
            
            // Bright red lights
            const lightColor = (color === C.enemy) ? '#ffaa00' : '#ff0000'; // Yellow for some enemies?
            ctx.fillStyle = lightColor;
            ctx.shadowBlur = 20;
            ctx.shadowColor = lightColor;
            
            if (color === C.pMain) {
                // Player Style: Cyber Strip
                ctx.fillRect(-w/2 + 25, 8, w/3, 8);
                ctx.fillRect(w/2 - w/3 - 25, 8, w/3, 8);
            } else {
                // Enemy Style: Two blocks
                ctx.fillRect(-w/2 + 25, 8, 40, 10);
                ctx.fillRect(w/2 - 65, 8, 40, 10);
            }
            ctx.shadowBlur = 0;

            // 6. Exhaust (Player only)
            if (color === C.pMain) {
                if (state.frame % 4 < 2) {
                    ctx.fillStyle = '#0ff';
                    ctx.beginPath();
                    ctx.arc(-40, 35, 6, 0, Math.PI*2);
                    ctx.arc(40, 35, 6, 0, Math.PI*2);
                    ctx.fill();
                }
            }

            ctx.restore();
        }

        function drawRear() {
            // 1. Sky
            const grad = ctx.createLinearGradient(0, 0, 0, H);
            grad.addColorStop(0, '#000000');
            grad.addColorStop(0.5, '#2d002d');
            grad.addColorStop(0.5, '#111111');
            grad.addColorStop(1, '#111111');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);

            const horizon = H/2;
            const fov = 300;

            // 2. Sun
            ctx.save();
            ctx.fillStyle = 'rgba(255, 0, 128, 0.2)';
            ctx.beginPath();
            ctx.arc(W/2, horizon, 150, Math.PI, 0);
            ctx.fill();
            ctx.restore();

            // 3. Grid Floor
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, horizon, W, H/2);
            ctx.clip();
            ctx.strokeStyle = 'rgba(200, 0, 255, 0.2)';
            ctx.lineWidth = 1;
            // Moving horizontal lines
            let speedOffset = (state.frame * 15) % 100;
            for (let z = 10; z < 2000; z+=80) {
                let scale = fov / (z - speedOffset + 100);
                let y = horizon + (100 * scale);
                if (y > H) continue;
                ctx.moveTo(0, y); ctx.lineTo(W, y);
            }
            // Perspective lines
            for(let x = -W; x <= W; x+=W/10) {
                ctx.moveTo(W/2 + x/4, horizon);
                ctx.lineTo(W/2 + x * 4, H);
            }
            ctx.stroke();
            ctx.restore();

            // 4. Road
            const centerX = W/2;
            const roadBaseW = W * 2.5; // Wide at bottom
            const roadTopW = 20;       // Narrow at horizon
            
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.moveTo(centerX - roadTopW, horizon);
            ctx.lineTo(centerX + roadTopW, horizon);
            ctx.lineTo(centerX + roadBaseW/2, H);
            ctx.lineTo(centerX - roadBaseW/2, H);
            ctx.fill();

            // Road Side Lines (Neon)
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(centerX - roadTopW, horizon); ctx.lineTo(centerX - roadBaseW/2, H);
            ctx.moveTo(centerX + roadTopW, horizon); ctx.lineTo(centerX + roadBaseW/2, H);
            ctx.stroke();

            // 5. Enemies
            // Sort by Z (furthest first)
            entities.sort((a,b) => b.z - a.z);
            
            entities.forEach(e => {
                if (e.z < 10) return;
                let scale = fov / (e.z + fov); // Perspective scale
                
                // X projection based on road width
                // Road width at 'z' is roughly proportional to scale
                // We want e.x (-1 to 1) to map to the road edges
                
                // Calculate horizontal position relative to center, influenced by perspective
                // Road visual width at this depth roughly W * scale
                let roadWidthAtZ = (W * 1.5) * scale; 
                
                let x = centerX + (e.x * roadWidthAtZ * 0.6); 
                
                // Camera shift (simulate player moving)
                x -= (player.x * W * 0.5) * scale;

                let y = horizon + 90 * scale;

                drawOutrunCar(ctx, x, y, scale * 1.2, e.color);
            });

            // 6. Player Car
            // Fixed near bottom, larger scale
            const pScale = 1.2; 
            drawOutrunCar(ctx, centerX, H - 80, pScale, C.pMain, player.tilt * 0.05);
        }

        // ============================================================
        // === MAIN LOOP ===
        // ============================================================

        function loop() {
            if (!state.active) return;
            requestAnimationFrame(loop);

            state.frame++;
            state.score++;
            scoreEl.innerText = state.score;

            // Mode Switching
            if (state.score > state.nextSwitch) {
                state.nextSwitch += 500;
                state.mode = (state.mode + 1) % 3;
                
                // Transition Effect
                glitchOverlay.style.display = 'block';
                setTimeout(() => glitchOverlay.style.display = 'none', 200);
                playTone(600, 'sawtooth', 0.5);
                
                if (state.mode === MODES.ISOMETRIC) initIso();
                else if (state.mode === MODES.SIDE) initSide();
                else if (state.mode === MODES.REAR) initRear();
            }

            // Draw Particles
            ctx.clearRect(0,0,W,H);
            
            if (state.mode === MODES.ISOMETRIC) {
                updateIso(); drawIso();
            } else if (state.mode === MODES.SIDE) {
                updateSide(); drawSide();
            } else if (state.mode === MODES.REAR) {
                updateRear(); drawRear();
            }

            // Render Particles
            for (let i=particles.length-1; i>=0; i--) {
                let p = particles[i];
                p.x += p.vx; p.y += p.vy;
                p.life -= 0.05;
                if (p.life <= 0) particles.splice(i,1);
                else {
                    ctx.globalAlpha = p.life;
                    ctx.fillStyle = p.color;
                    ctx.fillRect(p.x, p.y, p.size, p.size);
                }
            }
            ctx.globalAlpha = 1.0;
        }

        function startGame() {
            state.active = true;
            state.menu = false;
            state.lives = 100;
            state.score = 0;
            state.mode = MODES.ISOMETRIC;
            state.offRoad = 0;
            state.nextSwitch = 500;
            
            menuScreen.style.display = 'none';
            updateLives();
            initIso();
            loop();
            
            // Audio Context Resume
            if (audioCtx.state === 'suspended') audioCtx.resume();
            playTone(440, 'sine', 0.5);
        }

        function gameOver() {
            state.active = false;
            state.menu = true;
            menuScreen.style.display = 'flex';
            document.querySelector('#menuScreen h1').innerHTML = "SİSTEM<br>ÇÖKTÜ";
            document.querySelector('#menuScreen h2').innerText = "SKOR: " + state.score;
            startBtn.querySelector('span').innerText = "YENİDEN";
            requestAnimationFrame(animateMenuCar);
        }

        // --- Input Listeners ---
        window.addEventListener('keydown', e => keys[e.key] = true);
        window.addEventListener('keyup', e => keys[e.key] = false);

        // Touch
        const touchMap = { 
            'btnLeft': ['ArrowLeft'], 'btnRight': ['ArrowRight'], 
            'btnUp': ['ArrowUp'], 'btnDown': ['ArrowDown'] 
        };
        Object.keys(touchMap).forEach(id => {
            const el = document.getElementById(id);
            if(!el) return;
            el.addEventListener('touchstart', (e) => { e.preventDefault(); touchMap[id].forEach(k => keys[k] = true); });
            el.addEventListener('touchend', (e) => { e.preventDefault(); touchMap[id].forEach(k => keys[k] = false); });
        });

        if ('ontouchstart' in window) document.getElementById('mobileControls').classList.remove('hidden');

        startBtn.addEventListener('click', startGame);

    