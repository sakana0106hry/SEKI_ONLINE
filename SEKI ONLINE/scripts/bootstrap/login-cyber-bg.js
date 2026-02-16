    (() => {
        const loginScreen = document.getElementById("login-screen");
        const canvas = document.getElementById("login-cyber-bg");
        if (!loginScreen || !canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const colors = ["#00d8ff", "#34f78d", "#ff355e"];
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        let width = 0;
        let height = 0;
        let dpr = 1;
        let rafId = null;
        let particles = [];

        function toRgba(hex, alpha) {
            const value = hex.replace("#", "");
            const r = parseInt(value.substring(0, 2), 16);
            const g = parseInt(value.substring(2, 4), 16);
            const b = parseInt(value.substring(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        class StreamParticle {
            constructor(seedY) {
                this.reset(seedY);
            }
            reset(seedY) {
                this.x = Math.random() * width;
                this.y = typeof seedY === "number" ? seedY : height + Math.random() * (height * 0.45);
                this.speed = 0.6 + Math.random() * 1.8;
                this.len = 12 + Math.random() * 36;
                this.size = 0.8 + Math.random() * 1.7;
                this.alpha = 0.38 + Math.random() * 0.5;
                this.color = colors[Math.floor(Math.random() * colors.length)];
            }
            update() {
                this.y -= this.speed;
                if (this.y < -this.len - 5) this.reset();
            }
            draw() {
                const grad = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.len);
                grad.addColorStop(0, toRgba(this.color, this.alpha));
                grad.addColorStop(1, "rgba(0, 0, 0, 0)");
                ctx.fillStyle = grad;
                ctx.fillRect(this.x, this.y, this.size, this.len);
            }
        }

        function drawFrame(isStatic) {
            ctx.fillStyle = isStatic ? "rgba(3, 10, 22, 0.85)" : "rgba(3, 10, 22, 0.24)";
            ctx.fillRect(0, 0, width, height);

            particles.forEach((particle) => {
                if (!isStatic) particle.update();
                particle.draw();
            });

            if (!isStatic && Math.random() > 0.985) {
                const glitchColor = toRgba(colors[Math.floor(Math.random() * colors.length)], 0.5);
                ctx.fillStyle = glitchColor;
                ctx.fillRect(0, Math.random() * height, width, Math.random() * 2 + 0.5);
            }
        }

        function rebuildParticles() {
            const count = Math.max(36, Math.floor(width / 16));
            particles = [];
            for (let i = 0; i < count; i++) {
                particles.push(new StreamParticle(Math.random() * height));
            }
        }

        function resizeCanvas() {
            const rect = canvas.getBoundingClientRect();
            width = Math.max(1, Math.floor(rect.width));
            height = Math.max(1, Math.floor(rect.height));
            dpr = Math.min(window.devicePixelRatio || 1, 2);

            canvas.width = Math.floor(width * dpr);
            canvas.height = Math.floor(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            rebuildParticles();
            drawFrame(true);
        }

        function stopAnimation() {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        }

        function tick() {
            if (loginScreen.classList.contains("hidden")) {
                stopAnimation();
                return;
            }
            drawFrame(false);
            rafId = requestAnimationFrame(tick);
        }

        function startAnimation() {
            if (rafId !== null) return;
            if (reduceMotion.matches) return;
            if (loginScreen.classList.contains("hidden")) return;
            rafId = requestAnimationFrame(tick);
        }

        function handleMotionPrefChanged() {
            stopAnimation();
            resizeCanvas();
            if (!reduceMotion.matches && !loginScreen.classList.contains("hidden")) {
                startAnimation();
            }
        }

        window.addEventListener("resize", resizeCanvas);
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) stopAnimation();
            else if (!reduceMotion.matches && !loginScreen.classList.contains("hidden")) startAnimation();
        });

        if (typeof reduceMotion.addEventListener === "function") {
            reduceMotion.addEventListener("change", handleMotionPrefChanged);
        } else if (typeof reduceMotion.addListener === "function") {
            reduceMotion.addListener(handleMotionPrefChanged);
        }

        const observer = new MutationObserver(() => {
            if (loginScreen.classList.contains("hidden")) stopAnimation();
            else if (!reduceMotion.matches) startAnimation();
        });
        observer.observe(loginScreen, { attributes: true, attributeFilter: ["class"] });

        resizeCanvas();
        if (!reduceMotion.matches) startAnimation();
    })();
