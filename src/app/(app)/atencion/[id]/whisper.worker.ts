// «Abrir audio»: Whisper corre aquí, en la PC (WebAssembly), sin enviar el audio a ningún servidor.
// La primera vez descarga el modelo (Hugging Face) y lo deja en la caché del navegador; después no necesita internet.
// Recibe el audio ya decodificado a 16 kHz mono y devuelve el texto por trozos de 30 s, para mostrar el avance.
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

const MODELO_VOZ = "onnx-community/whisper-base";
// Versión exacta del modelo (14-nov): si Hugging Face cambia los archivos, la app sigue bajando estos
const REVISION_VOZ = "27a07b4b52b3a4c5886134bb4320e93e1a4bbc7c";
const SEG = 16000 * 30;

env.allowLocalModels = false;
env.useBrowserCache = true;
// El motor ONNX sale de la app (/voz), no de un CDN (src/build/recursos-voz.mjs)
if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = "/voz/";

export type MensajeVoz =
  | { tipo: "descarga"; avance: number } // 0..1
  | { tipo: "avance"; hecho: number; total: number; texto: string }
  | { tipo: "listo" }
  | { tipo: "error"; mensaje: string };

// Tipo simplificado: el de la librería es una unión que TypeScript no alcanza a calcular
const crear = pipeline as unknown as (tarea: string, modelo: string, opciones: object) => Promise<AutomaticSpeechRecognitionPipeline>;
let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

const enviar = (m: MensajeVoz) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (e: MessageEvent<{ audio: Float32Array }>) => {
  try {
    const archivos = new Map<string, { cargado: number; total: number }>();
    asr ??= crear("automatic-speech-recognition", MODELO_VOZ, {
      revision: REVISION_VOZ,
      dtype: "q8",
      device: "wasm",
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status !== "progress" || !p.file || !p.total) return;
        archivos.set(p.file, { cargado: p.loaded ?? 0, total: p.total });
        const t = [...archivos.values()].reduce((s, x) => ({ cargado: s.cargado + x.cargado, total: s.total + x.total }), { cargado: 0, total: 0 });
        enviar({ tipo: "descarga", avance: t.total ? t.cargado / t.total : 0 });
      },
    });
    const modelo = await asr;
    const { audio } = e.data;
    const total = Math.max(1, Math.ceil(audio.length / SEG));
    for (let i = 0; i < total; i++) {
      const trozo = audio.subarray(i * SEG, (i + 1) * SEG);
      const r = await modelo(trozo, { language: "spanish", task: "transcribe" });
      const texto = (Array.isArray(r) ? r.map((x) => x.text).join(" ") : r.text).trim();
      enviar({ tipo: "avance", hecho: i + 1, total, texto });
    }
    enviar({ tipo: "listo" });
  } catch (err) {
    asr = null;
    enviar({ tipo: "error", mensaje: (err as Error).message || "No se pudo leer el audio." });
  }
};
