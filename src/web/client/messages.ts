export type ButtonState = "idle" | "rec" | "busy";

export interface Messages extends Record<ButtonState, string> {
  insecure: string;
  blocked: string;
  failed: string;
  nothing: string;
}

const PORTUGUESE: Messages = {
  idle: "Falar (Alt+M)",
  rec: "Ouvindo — Alt+M ou clique para parar · Esc cancela",
  busy: "Finalizando a transcrição…",
  insecure: "O microfone exige HTTPS ou localhost",
  blocked: "Microfone bloqueado",
  failed: "Falha na transcrição",
  nothing: "Nenhuma fala detectada",
};

const ENGLISH: Messages = {
  idle: "Speak (Alt+M)",
  rec: "Listening — Alt+M or click to stop · Esc cancels",
  busy: "Finishing transcription…",
  insecure: "The microphone needs HTTPS or localhost",
  blocked: "Microphone blocked",
  failed: "Transcription failed",
  nothing: "No speech detected",
};

export const messages: Messages = (navigator.language || "").toLowerCase().startsWith("pt")
  ? PORTUGUESE
  : ENGLISH;
