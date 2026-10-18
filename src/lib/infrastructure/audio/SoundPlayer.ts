// Riproduzione effetti sonori con elementi <audio> riutilizzati.
// Prima ogni tiro creava un nuovo `new Audio(src)` (nuova richiesta + decodifica + oggetto mai rilasciato).

const cache = new Map<string, HTMLAudioElement>();

const canPlay = () => typeof window !== 'undefined' && typeof Audio !== 'undefined';

function getAudio(src: string): HTMLAudioElement {
    let audio = cache.get(src);
    if (!audio) {
        audio = new Audio(src);
        audio.preload = 'auto';
        cache.set(src, audio);
    }
    return audio;
}

/** Scarica in anticipo i suoni (a browser idle) così il primo tiro non ha ritardi. */
export function preloadSounds(srcs: string[]): void {
    if (!canPlay()) return;
    const run = () => srcs.forEach(getAudio);
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(run);
    else setTimeout(run, 500);
}

/** Riproduce un effetto. Restituisce l'elemento solo per i loop (per poterli fermare). */
export function playSound(src: string, loop = false): HTMLAudioElement | null {
    if (!canPlay()) return null;
    try {
        let audio = getAudio(src);
        if (loop) {
            audio = audio.cloneNode(true) as HTMLAudioElement; // il loop non deve bloccare l'elemento condiviso
            audio.loop = true;
        } else if (!audio.paused && !audio.ended) {
            audio = audio.cloneNode(true) as HTMLAudioElement; // già in riproduzione: sovrapponi
        } else {
            audio.currentTime = 0;
        }
        audio.play().catch(() => {
            /* autoplay bloccato finché l'utente non interagisce: ignorabile */
        });
        return loop ? audio : null;
    } catch {
        return null;
    }
}

export function stopSound(audio: HTMLAudioElement | null): void {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
}
