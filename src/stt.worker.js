import { pipeline, env } from "@huggingface/transformers";
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
let transcriber;
self.onmessage = async ({ data }) => {
  try {
    transcriber ??= await pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-base",
      {
        dtype: "q8",
        device: "wasm",
        progress_callback: (progress) => {
          if (progress.status === "progress")
            self.postMessage({
              status: "loading",
              progress: Math.round(progress.progress || 0),
            });
        },
      },
    );
    self.postMessage({ status: "transcribing" });
    const result = await transcriber(data.audio, {
      language: "spanish",
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: false,
    });
    self.postMessage({ status: "done", text: result.text });
  } catch (error) {
    console.error("UCORCI Whisper:", error.message);
    transcriber = null;
    self.postMessage({
      status: "error",
      error:
        "No se pudo transcribir. Revisá la conexión para descargar el modelo y la memoria del dispositivo. Podés usar el servicio local faster-whisper si está configurado.",
    });
  }
};
