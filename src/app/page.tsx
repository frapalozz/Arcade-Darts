import { Rocket, Unplug } from "lucide-react";

export default function Home() {
  return (
    <div className="">
      <main className="flex flex-col items-center justify-center min-h-screen gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="uppercase block text-primary text-5xl md:text-7xl italic tracking-tighter drop-shadow-[4px_4px_0px_#064200]">
            Arcade Darts
          </h1>
          <p className="font-headline text-[10px] text-primary text-center">
            Insert a coin to start 🪙
          </p>
        </div>
        <div className="gap-4 grid grid-cols-2 grid-flow-col">

          <div className="h-full flex flex-col w-full border border-primary-container p-4 gap-2 max-w-75">
            <div className="text-white flex flex-row gap-2 items-center">
              <Rocket className="stroke-primary" /> 
              <p className="text-xs uppercase">Nuova_Partita</p>
            </div>
            <p className={`text-neutral-400 text-xs font-medium font-body`}>Crea una nuova lobby e invita giocatori a partecipare</p>
            <button className="bg-primary text-on-primary text-xs p-3 w-full mt-auto">Crea</button>
          </div>

          <div className="h-full w-full border border-secondary-container p-4 gap-2 max-w-75 flex flex-col">
            <div className="text-white flex flex-row gap-2 items-center">
              <Unplug className="stroke-secondary" /> 
              <p className="text-xs uppercase">Partecipa</p>
            </div>
            <p className={`text-[0.45rem] text-secondary-dim uppercase`}>enter_lobby_code</p>
            <input type="text" className="bg-neutral-800 outline outline-secondary text-secondary px-2 text-sm" />
            <button className="bg-secondary text-on-secondary text-xs p-3 w-full mt-auto">Partecipa</button>
          </div>
        </div>
        
      </main>
    </div>
  );
}
