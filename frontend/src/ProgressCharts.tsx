import { useEffect, useRef } from "react";
import {
  BarController, BarElement, CategoryScale, Chart, Filler, Legend,
  LineController, LineElement, LinearScale, PointElement, Tooltip
} from "chart.js";
import type { ProgressPoint } from "./types";
import { formatKg } from "./lib";

Chart.register(BarController, BarElement, CategoryScale, Filler, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip);

export function ProgressCharts({ points }: { points: ProgressPoint[] }) {
  const strengthCanvas = useRef<HTMLCanvasElement>(null);
  const volumeCanvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!strengthCanvas.current || !volumeCanvas.current) return;
    const labels = points.map((point) => new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" }).format(new Date(point.date)));
    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#a1a1aa", boxWidth: 10, font: { family: "Geist Mono" } } } },
      scales: {
        x: { ticks: { color: "#71717a", font: { family: "Geist Mono", size: 10 } }, grid: { color: "#202027" } },
        y: { ticks: { color: "#71717a", font: { family: "Geist Mono", size: 10 } }, grid: { color: "#202027" }, beginAtZero: true }
      }
    };
    const strength = new Chart(strengthCanvas.current, {
      type: "line",
      data: { labels, datasets: [
        { label: "1RM Epley", data: points.map((point) => point.best_1rm), borderColor: "#a78bfa", backgroundColor: "rgba(167,139,250,.14)", fill: true, pointBackgroundColor: "#c4b5fd", tension: .34 },
        { label: "Carga máxima", data: points.map((point) => point.max_weight), borderColor: "#38bdf8", borderDash: [5, 5], pointRadius: 3, tension: .34 }
      ] }, options: baseOptions
    });
    const volume = new Chart(volumeCanvas.current, {
      type: "bar",
      data: { labels, datasets: [{ label: "Volumen por sesión", data: points.map((point) => point.total_volume), backgroundColor: "rgba(124,58,237,.82)", borderRadius: 4 }] },
      options: baseOptions
    });
    return () => { strength.destroy(); volume.destroy(); };
  }, [points]);

  if (!points.length) return <div className="empty-state">No hay sesiones registradas para este ejercicio en este periodo.</div>;
  const latest = points.at(-1)!;
  return <>
    <section className="chart-card"><div className="section-heading"><div><h2>Evolución de fuerza estimada</h2><p>1RM calculado con la ecuación de Epley.</p></div><span className="mono accent">{formatKg(latest.best_1rm)} kg</span></div><div className="chart-wrap"><canvas ref={strengthCanvas} /></div></section>
    <section className="chart-card"><div className="section-heading"><div><h2>Volumen de carga por sesión</h2><p>Tonelaje acumulado del ejercicio seleccionado.</p></div></div><div className="chart-wrap"><canvas ref={volumeCanvas} /></div></section>
  </>;
}
