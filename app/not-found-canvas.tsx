"use client";

import { useEffect, useRef } from "react";

type Point = { x: number; y: number };
type EyeSpec = [number, number, number, number];

const eyeSpecs: EyeSpec[] = [
  [.19,.80,.88,.08],[.10,.54,.84,.12],[.81,.13,.63,.16],[.89,.19,.58,.20],
  [.40,.08,.97,.24],[.64,.74,.57,.28],[.41,.89,.56,.32],[.92,.89,.75,.36],
  [.27,.20,.87,.40],[.17,.46,.68,.44],[.71,.29,.93,.48],[.84,.46,.54,.52],
  [.93,.35,.63,.56],[.77,.82,.85,.60],[.36,.74,.90,.64],[.13,.24,.85,.68],
  [.58,.20,.77,.72],[.55,.84,.87,.76],
];

export default function NotFoundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let frame = 0;
    let startTime = performance.now();
    const pointer: Point = { x: width / 2, y: height / 2 };

    class Eye {
      x = 0;
      y = 0;
      size = 0;
      iris: Point = { x: 0, y: 0 };
      exposure = 0;
      exposureTarget = 1;
      blinkTime = performance.now();
      blinkInterval = 3500 + Math.random() * 5000;
      irisSpeed: number;
      blinkSpeed = .12 + Math.random() * .1;

      constructor(private spec: EyeSpec) {
        this.irisSpeed = .025 + Math.random() * .08 / Math.max(spec[2], .5);
        this.layout();
      }

      layout() {
        const [x, y, rawScale] = this.spec;
        const scale = rawScale === 5 ? Math.min(5, width / 155, height / 115) : rawScale * Math.min(1, width / 900 + .2);
        this.size = 70 * scale;
        this.x = x * width;
        this.y = y * height + this.size * .15;
        if (!this.iris.x && !this.iris.y) this.iris = { x: this.x, y: this.y - this.size * .1 };
      }

      render(now: number) {
        if (now - this.blinkTime > this.blinkInterval) {
          this.exposureTarget = 0;
          this.blinkTime = now;
          this.blinkInterval = 3500 + Math.random() * 5000;
        }
        this.exposure += (this.exposureTarget - this.exposure) * this.blinkSpeed;
        if (this.exposure < .018) this.exposureTarget = 1;

        const left = { x: this.x - this.size * .8, y: this.y - this.size * .1 };
        const right = { x: this.x + this.size * .8, y: this.y - this.size * .1 };
        const top = { x: this.x, y: this.y - this.size * (.5 + .52 * this.exposure) };
        const bottom = { x: this.x, y: this.y - this.size * (.5 - .68 * this.exposure) };
        const offsetX = pointer.x / Math.max(width, 1) - .5;
        const offsetY = pointer.y / Math.max(height, 1) - .5;
        const irisTarget = { x: this.x + offsetX * Math.max(16, this.size * .12), y: this.y - this.size * .1 + offsetY * Math.max(10, this.size * .08) };
        this.iris.x += (irisTarget.x - this.iris.x) * this.irisSpeed;
        this.iris.y += (irisTarget.y - this.iris.y) * this.irisSpeed;

        context.lineJoin = "round";
        context.lineWidth = Math.max(1.5, this.size / 70 * 3);
        context.strokeStyle = "rgba(105,105,105,.95)";
        context.fillStyle = "#fff";
        context.beginPath();
        context.moveTo(left.x, left.y);
        context.quadraticCurveTo(top.x, top.y, right.x, right.y);
        context.quadraticCurveTo(bottom.x, bottom.y, left.x, left.y);
        context.closePath();
        context.fill();
        context.stroke();

        const irisSize = this.size * .2;
        context.save();
        context.globalCompositeOperation = "source-atop";
        context.fillStyle = "rgba(178,27,1,.88)";
        context.strokeStyle = "rgba(0,0,0,.55)";
        context.lineWidth = Math.max(1, this.size / 80);
        context.beginPath();
        context.arc(this.iris.x, this.iris.y, irisSize, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.fillStyle = "rgba(0,0,0,.9)";
        context.beginPath();
        context.ellipse(this.iris.x, this.iris.y, Math.max(1.5, this.size * .018), irisSize * .72, 0, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }

    let eyes: Eye[] = [];
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      eyes = [...eyeSpecs, [.5,.5,5,.04] as EyeSpec].map(spec => new Eye(spec));
      startTime = performance.now();
    };
    const move = (event: PointerEvent) => { pointer.x = event.clientX; pointer.y = event.clientY; };
    const animate = (now: number) => {
      context.clearRect(0, 0, width, height);
      const elapsed = Math.min(1, (now - startTime) / 2600);
      eyes.forEach((eye, index) => {
        const activation = index === eyes.length - 1 ? .05 : eyeSpecs[index][3];
        if (elapsed >= activation) eye.render(now);
      });
      frame = requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move, { passive: true });
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
    };
  }, []);

  return <canvas ref={canvasRef} className="not-found-canvas" aria-hidden="true" />;
}
